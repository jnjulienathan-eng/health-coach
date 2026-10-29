// POST /api/explore/tags  { label, start, end, note? }
// Creates a manual Explore tag. Service-role client. Validation in
// lib/explore/tags.ts → validateTag(): 400 for bad input, 409 with the
// overlapping tag when it clashes with another manual tag.
// See BODYCIPHER.md → EXPLORE → Tags.

import { supaAdmin } from '@/lib/nutrition'
import { todayBerlin } from '@/lib/explore/fetch'
import { validateTag } from '@/lib/explore/tags'
import { loadManualTags, rowToManualTag, describe, EXPLORE_TAGS_USER } from '@/lib/explore/tagsDb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
  let body: { label?: unknown; start?: unknown; end?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const client = supaAdmin()
    const manual = await loadManualTags(client)
    const v = validateTag(body, manual, todayBerlin())
    if (!v.ok) return Response.json(v, { status: v.status })

    const { data, error } = await client
      .from('explore_tags')
      .insert({ user_id: EXPLORE_TAGS_USER, label: v.value.label, start_date: v.value.start, end_date: v.value.end, note: v.value.note })
      .select('id, label, start_date, end_date, note')
      .single()
    if (error) throw error
    return Response.json(rowToManualTag(data as Record<string, unknown>), { status: 201 })
  } catch (e) {
    console.error('POST /api/explore/tags failed:', describe(e))
    return Response.json({ error: describe(e) }, { status: 500 })
  }
}
