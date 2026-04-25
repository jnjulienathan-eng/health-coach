// /api/nutrition/templates
//
// GET    — list templates sorted by use_count desc, with their items joined to food_items
// POST   — create new template
// PUT    — update template (name, notes, items wholesale)
// DELETE — delete template (cascade items)
//
// Templates never affect daily_nutrition_summary — saving a template is
// independent of logging a meal.

import { NextRequest } from 'next/server'
import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

interface ItemInput {
  food_item_id: string
  default_weight_grams: number
}

function validItems(items: unknown): items is ItemInput[] {
  if (!Array.isArray(items)) return false
  return items.every(i =>
    i && typeof i === 'object'
    && typeof (i as ItemInput).food_item_id === 'string'
    && typeof (i as ItemInput).default_weight_grams === 'number'
    && (i as ItemInput).default_weight_grams >= 0,
  )
}

// ─── GET ─────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = supaAdmin()
  const userId = nutritionUserId()

  const { data: templates, error: tErr } = await supabase
    .from('meal_templates')
    .select('*')
    .eq('user_id', userId)
    .order('use_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })
  if (!templates || templates.length === 0) return Response.json({ templates: [] })

  const templateIds = templates.map(t => t.id as string)
  const { data: items, error: iErr } = await supabase
    .from('meal_template_items')
    .select('id, template_id, default_weight_grams, food_items(id, name, fdc_id, source, nutrients_per_100g)')
    .in('template_id', templateIds)

  if (iErr) return Response.json({ error: iErr.message }, { status: 500 })

  const byTemplate: Record<string, unknown[]> = {}
  for (const it of items ?? []) {
    const k = it.template_id as string
    if (!byTemplate[k]) byTemplate[k] = []
    byTemplate[k].push(it)
  }

  const out = templates.map(t => ({ ...t, items: byTemplate[t.id as string] ?? [] }))
  return Response.json({ templates: out })
}

// ─── POST ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: { name?: string; notes?: string | null; items?: ItemInput[] }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = (body.name ?? '').trim()
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
  if (body.items != null && !validItems(body.items)) {
    return Response.json({ error: 'items must be array of {food_item_id, default_weight_grams}' }, { status: 400 })
  }

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  const { data: tpl, error: tErr } = await supabase
    .from('meal_templates')
    .insert({
      user_id: userId,
      name,
      notes: body.notes ?? null,
      use_count: 0,
    })
    .select('*')
    .single()
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })

  if (body.items && body.items.length > 0) {
    const rows = body.items.map(i => ({
      template_id: tpl.id as string,
      food_item_id: i.food_item_id,
      default_weight_grams: i.default_weight_grams,
    }))
    const { error: iErr } = await supabase.from('meal_template_items').insert(rows)
    if (iErr) return Response.json({ error: iErr.message }, { status: 500 })
  }

  return Response.json({ template: tpl })
}

// ─── PUT ─────────────────────────────────────────────────────────────────
export async function PUT(req: Request) {
  let body: { id?: string; name?: string; notes?: string | null; items?: ItemInput[]; bump_use_count?: boolean }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // Ownership check + read current use_count for optional bump.
  const { data: existing, error: lookupErr } = await supabase
    .from('meal_templates')
    .select('id, use_count')
    .eq('id', body.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupErr) return Response.json({ error: lookupErr.message }, { status: 500 })
  if (!existing) return Response.json({ error: 'template not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const n = (body.name ?? '').trim()
    if (!n) return Response.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = n
  }
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.bump_use_count) updates.use_count = ((existing.use_count as number | null) ?? 0) + 1

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabase.from('meal_templates').update(updates).eq('id', body.id)
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  }

  if (body.items !== undefined) {
    if (!validItems(body.items)) {
      return Response.json({ error: 'items must be array of {food_item_id, default_weight_grams}' }, { status: 400 })
    }
    const { error: delErr } = await supabase.from('meal_template_items').delete().eq('template_id', body.id)
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

    if (body.items.length > 0) {
      const rows = body.items.map(i => ({
        template_id: body.id as string,
        food_item_id: i.food_item_id,
        default_weight_grams: i.default_weight_grams,
      }))
      const { error: insErr } = await supabase.from('meal_template_items').insert(rows)
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
    }
  }

  return Response.json({ ok: true })
}

// ─── DELETE ──────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  const { error } = await supabase
    .from('meal_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
