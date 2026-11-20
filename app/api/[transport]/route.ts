// /api/mcp — remote MCP server (Streamable HTTP, stateless)
//
// Replaces the standalone local stdio MCP server (~/Documents/Northstar/bodycipher-mcp),
// hosted as a Vercel route instead. Same two tools, same underlying fetch calls to the
// existing quick-log/quick-import routes — this is a transport swap, not a rewrite.
// Nov 2026: four read/delete tools added (list_recipes, delete_recipe, list_meals,
// delete_meal), calling the existing recipe / day / meal routes. See BODYCIPHER.md.
//
// Inbound auth: every request must carry a bearer access token issued by the OAuth 2.1
// layer in app/oauth/* + lib/mcp-auth.ts (discovery at app/.well-known/*). Replaces the
// earlier static x-mcp-secret header check — that mechanism is removed as of this change
// because Claude's phone/web custom-connector UI only supports OAuth, not static headers.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyBearerToken } from '@/lib/mcp-auth'
import { MACRO_KEYS, emptyMacros, macrosFor, type Macros } from '@/lib/nutrition'
import { berlinDate, berlinParts } from '@/lib/berlinTime'

// ─── Helpers for the read/delete tools (list_recipes, delete_recipe,
// list_meals, delete_meal — added Nov 2026). log_meal and save_recipe above
// keep their own inline fetch code and always call production.
//
// The new tools call the deployment they run on: on a Vercel preview that is
// the preview's own URL (so a preview tests its own routes), everywhere else
// production. On preview only, VERCEL_AUTOMATION_BYPASS_SECRET (if set) is
// sent as x-vercel-protection-bypass so Deployment Protection lets the call in.
const PROD_ORIGIN = 'https://health-coach-rho.vercel.app'

function isPreview(): boolean {
  return process.env.VERCEL_ENV === 'preview' && !!process.env.VERCEL_URL
}

function internalOrigin(): string {
  return isPreview() ? `https://${process.env.VERCEL_URL}` : PROD_ORIGIN
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

function toolError(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

// Same shape as the log_meal / save_recipe handlers: MCP_SECRET check,
// fetch with x-mcp-secret, network error → "Network error: …", non-2xx →
// "{failPrefix}: {error field or HTTP status}".
async function callInternal(
  tool: string,
  failPrefix: string,
  path: string,
  method: 'GET' | 'DELETE',
): Promise<{ json: Record<string, unknown> } | { error: ToolResult }> {
  const secret = process.env.MCP_SECRET
  if (!secret) return { error: toolError('Error: MCP_SECRET environment variable is not set.') }

  const headers: Record<string, string> = { 'x-mcp-secret': secret }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (isPreview() && bypass) headers['x-vercel-protection-bypass'] = bypass

  let response: Response
  try {
    response = await fetch(`${internalOrigin()}${path}`, { method, headers, cache: 'no-store' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${tool} fetch error:`, message)
    return { error: toolError(`Network error: ${message}`) }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!response.ok) {
    const detail =
      json && typeof json === 'object' && 'error' in json
        ? String((json as Record<string, unknown>).error)
        : `HTTP ${response.status}`
    console.error(`${tool} API error:`, detail)
    return { error: toolError(`${failPrefix}: ${detail}`) }
  }

  if (!json || typeof json !== 'object') {
    console.error(`${tool} API error: response was not JSON`)
    return { error: toolError(`${failPrefix}: response was not JSON (HTTP ${response.status})`) }
  }

  return { json: json as Record<string, unknown> }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function roundMacros(m: Macros): Macros {
  const out = emptyMacros()
  for (const k of MACRO_KEYS) out[k] = round1(m[k])
  return out
}

// food_items.nutrients_per_100g → the five macros, or null if the JSONB is
// missing or carries none of them.
function per100gMacros(n: unknown): Macros | null {
  if (!n || typeof n !== 'object') return null
  const obj = n as Record<string, unknown>
  if (!MACRO_KEYS.some(k => Number.isFinite(typeof obj[k] === 'number' ? obj[k] : parseFloat(obj[k] as string)))) return null
  return macrosFor(obj, 100)
}

// Supabase types an embedded one-to-one join as an array or an object.
function firstJoined(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.tool(
      'save_recipe',
      'Save a recipe with macro nutrition data to the BodyCipher health coach app',
      {
        name: z.string().describe("A concise, descriptive, food-forward name for this recipe. Maximum 40 characters. Based on the actual ingredients or content — never time-of-day based (never 'Morning meal', 'Evening snack' etc.). Examples: 'Greek yogurt & berry bowl', 'Pulled chicken sandwich', 'Sardine & lentil salad'."),
        default_serving_grams: z.number().describe('Default serving size in grams'),
        calories_per_serving: z.number().describe('Calories per serving'),
        protein_per_serving: z.number().describe('Protein in grams per serving'),
        carbs_per_serving: z.number().describe('Carbohydrates in grams per serving'),
        fat_per_serving: z.number().describe('Fat in grams per serving'),
        fiber_per_serving: z.number().describe('Fiber in grams per serving'),
        ingredients_text: z.string().optional().describe('Optional free-text ingredients list'),
      },
      async (params) => {
        const secret = process.env.MCP_SECRET
        if (!secret) {
          return {
            content: [{ type: 'text', text: 'Error: MCP_SECRET environment variable is not set.' }],
            isError: true,
          }
        }

        const body: Record<string, unknown> = {
          name: params.name,
          default_serving_grams: params.default_serving_grams,
          macros: {
            calories: params.calories_per_serving,
            protein: params.protein_per_serving,
            carbs: params.carbs_per_serving,
            fat: params.fat_per_serving,
            fiber: params.fiber_per_serving,
          },
        }

        if (params.ingredients_text !== undefined) {
          body.ingredients_text = params.ingredients_text
        }

        let response: Response
        try {
          response = await fetch(
            'https://health-coach-rho.vercel.app/api/nutrition/recipe/quick-import',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-mcp-secret': secret,
              },
              body: JSON.stringify(body),
            }
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('save_recipe fetch error:', message)
          return {
            content: [{ type: 'text', text: `Network error: ${message}` }],
            isError: true,
          }
        }

        let json: unknown
        try {
          json = await response.json()
        } catch {
          json = null
        }

        if (!response.ok) {
          const detail =
            json && typeof json === 'object' && 'error' in json
              ? String((json as Record<string, unknown>).error)
              : `HTTP ${response.status}`
          console.error('save_recipe API error:', detail)
          return {
            content: [{ type: 'text', text: `Failed to save recipe: ${detail}` }],
            isError: true,
          }
        }

        const id =
          json && typeof json === 'object' && 'id' in json
            ? String((json as Record<string, unknown>).id)
            : undefined

        const successMsg = id
          ? `Recipe "${params.name}" saved successfully (id: ${id}).`
          : `Recipe "${params.name}" saved successfully.`

        return {
          content: [{ type: 'text', text: successMsg }],
        }
      }
    )

    server.tool(
      'log_meal',
      "Log a meal with macro nutrition data to today's BodyCipher health coach diary",
      {
        name: z.string().describe("A concise, descriptive, food-forward name for this meal. Maximum 40 characters. Based on the actual ingredients or content — never time-of-day based (never 'Morning meal', 'Evening snack' etc.). Examples: 'Greek yogurt & berry bowl', 'Pulled chicken sandwich', 'Sardine & lentil salad'."),
        calories: z.number().describe('Calories'),
        protein: z.number().describe('Protein in grams'),
        carbs: z.number().describe('Carbohydrates in grams'),
        fat: z.number().describe('Fat in grams'),
        fiber: z.number().describe('Fiber in grams'),
      },
      async (params) => {
        const secret = process.env.MCP_SECRET
        if (!secret) {
          return {
            content: [{ type: 'text', text: 'Error: MCP_SECRET environment variable is not set.' }],
            isError: true,
          }
        }

        let response: Response
        try {
          response = await fetch(
            'https://health-coach-rho.vercel.app/api/nutrition/meal/quick-log',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-mcp-secret': secret,
              },
              body: JSON.stringify({
                name: params.name,
                calories: params.calories,
                protein: params.protein,
                carbs: params.carbs,
                fat: params.fat,
                fiber: params.fiber,
              }),
            }
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('log_meal fetch error:', message)
          return {
            content: [{ type: 'text', text: `Network error: ${message}` }],
            isError: true,
          }
        }

        let json: unknown
        try {
          json = await response.json()
        } catch {
          json = null
        }

        if (!response.ok) {
          const detail =
            json && typeof json === 'object' && 'error' in json
              ? String((json as Record<string, unknown>).error)
              : `HTTP ${response.status}`
          console.error('log_meal API error:', detail)
          return {
            content: [{ type: 'text', text: `Failed to log meal: ${detail}` }],
            isError: true,
          }
        }

        const date =
          json && typeof json === 'object' && 'date' in json
            ? String((json as Record<string, unknown>).date)
            : undefined

        const successMsg = date
          ? `Meal "${params.name}" logged successfully for ${date}.`
          : `Meal "${params.name}" logged successfully.`

        return {
          content: [{ type: 'text', text: successMsg }],
        }
      }
    )

    server.tool(
      'list_recipes',
      'List every recipe in the BodyCipher recipe library (My Library), with macros per serving and per 100 g',
      {
        query: z.string().optional().describe('Optional case-insensitive filter on the recipe name'),
      },
      async (params) => {
        const res = await callInternal('list_recipes', 'Failed to list recipes', '/api/nutrition/recipe', 'GET')
        if ('error' in res) return res.error

        const rows = Array.isArray(res.json.recipes) ? (res.json.recipes as Record<string, unknown>[]) : []
        const q = params.query?.trim().toLowerCase()

        const recipes = rows
          .filter(r => !q || String(r.name ?? '').toLowerCase().includes(q))
          .map(r => {
            const per100 = per100gMacros(firstJoined(r.food_items)?.nutrients_per_100g)
            const serving = Number(r.default_serving_grams)
            const hasServing = r.default_serving_grams != null && Number.isFinite(serving) && serving > 0
            const perServing = per100 && hasServing && r.status === 'active'
              ? roundMacros(macrosFor(per100, serving))
              : null
            return {
              id: r.id,
              name: r.name,
              default_serving_grams: hasServing ? serving : null,
              macros_per_serving: perServing,
              macros_per_100g: per100 ? roundMacros(per100) : null,
              created_at: r.created_at,
            }
          })

        return jsonResult({ count: recipes.length, recipes })
      }
    )

    server.tool(
      'delete_recipe',
      'Delete a recipe from the BodyCipher recipe library by id',
      {
        id: z.string().describe('The recipe id (from list_recipes)'),
      },
      async (params) => {
        const res = await callInternal(
          'delete_recipe',
          'Failed to delete recipe',
          `/api/nutrition/recipe?id=${encodeURIComponent(params.id)}`,
          'DELETE',
        )
        if ('error' in res) return res.error

        if (res.json.deleted !== true) {
          console.error('delete_recipe API error: no recipe with id', params.id)
          return toolError(`Failed to delete recipe: no recipe found with id ${params.id}`)
        }

        return jsonResult({ deleted: true, id: res.json.id, name: res.json.name })
      }
    )

    server.tool(
      'list_meals',
      "List the meals logged in the BodyCipher diary for one day, with each meal's Berlin time and macros",
      {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe('Day to list, YYYY-MM-DD. Defaults to today in Europe/Berlin.'),
      },
      async (params) => {
        const date = params.date ?? berlinDate()
        const res = await callInternal(
          'list_meals',
          'Failed to list meals',
          `/api/nutrition/day?date=${encodeURIComponent(date)}`,
          'GET',
        )
        if ('error' in res) return res.error

        const rows = Array.isArray(res.json.meals) ? (res.json.meals as Record<string, unknown>[]) : []

        const meals = rows.map(m => {
          // Same rule as recomputeDailySummary: photo_estimate meals carry
          // top-level macros; every other meal is the sum of its items.
          let macros = emptyMacros()
          if (m.logged_via === 'photo_estimate') {
            macros = {
              calories: Number(m.calories) || 0,
              protein: Number(m.protein_g) || 0,
              carbs: Number(m.carbs_g) || 0,
              fat: Number(m.fat_g) || 0,
              fiber: Number(m.fiber_g) || 0,
            }
          } else {
            for (const it of Array.isArray(m.items) ? (m.items as Record<string, unknown>[]) : []) {
              const fi = firstJoined(it.food_items)
              const add = macrosFor((fi?.nutrients_per_100g as Record<string, unknown>) ?? null, Number(it.weight_grams) || 0)
              for (const k of MACRO_KEYS) macros[k] += add[k]
            }
          }

          const p = berlinParts(new Date(String(m.logged_at)))
          return {
            id: m.id,
            name: m.name,
            time: `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`,
            macros: roundMacros(macros),
          }
        })

        return jsonResult({ date, count: meals.length, meals })
      }
    )

    server.tool(
      'delete_meal',
      'Delete a logged meal from the BodyCipher diary by id',
      {
        id: z.string().describe('The meal id (from list_meals)'),
      },
      async (params) => {
        const res = await callInternal(
          'delete_meal',
          'Failed to delete meal',
          `/api/nutrition/meal?id=${encodeURIComponent(params.id)}`,
          'DELETE',
        )
        if ('error' in res) return res.error

        if (res.json.deleted !== true) {
          console.error('delete_meal API error: no meal with id', params.id)
          return toolError(`Failed to delete meal: no meal found with id ${params.id}`)
        }

        return jsonResult({ deleted: true, id: res.json.id, name: res.json.name, date: res.json.date })
      }
    )
  },
  {
    serverInfo: { name: 'bodycipher', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
    maxDuration: 60,
  }
)

// Inbound auth — reject before any tool logic runs, via mcp-handler's withMcpAuth.
// verifyBearerToken (lib/mcp-auth.ts) checks the bearer token's HS256 signature
// (MCP_SECRET) and expiry. required: true means every request must carry a valid
// token — there is no unauthenticated fallback.
const handler = withMcpAuth(mcpHandler, verifyBearerToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
})

export { handler as GET, handler as POST, handler as DELETE }
