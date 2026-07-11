// /api/mcp — remote MCP server (Streamable HTTP, stateless)
//
// Replaces the standalone local stdio MCP server (~/Documents/Northstar/bodycipher-mcp),
// hosted as a Vercel route instead. Same two tools, same underlying fetch calls to the
// existing quick-log/quick-import routes — this is a transport swap, not a rewrite.
//
// Inbound auth: every request must carry x-mcp-secret matching MCP_SECRET. This check is
// new — the local stdio server had no equivalent, since trust came from being local-only.

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'

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

// Inbound auth — reject before any tool logic runs. This is new: the local stdio
// server trusted callers implicitly because it was local-only; the remote route is
// reachable over the network, so every request must present a matching secret.
function unauthorized(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'Unauthorized: missing or invalid x-mcp-secret header' },
    },
    { status: 401 }
  )
}

async function withAuth(request: Request): Promise<Response> {
  const expected = process.env.MCP_SECRET
  const provided = request.headers.get('x-mcp-secret')
  if (!expected || provided !== expected) {
    return unauthorized()
  }
  return mcpHandler(request)
}

export { withAuth as GET, withAuth as POST, withAuth as DELETE }
