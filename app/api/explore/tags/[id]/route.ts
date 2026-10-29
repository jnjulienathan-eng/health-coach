// PATCH  /api/explore/tags/[id]  { label?, start?, end?, note? } — update a manual tag
// DELETE /api/explore/tags/[id]                          — delete a manual tag
// Service-role client. PATCH merges the patch onto the stored tag, then runs
// validateTag() excluding the tag itself from the overlap check.
// See BODYCIPHER.md → EXPLORE → Tags.

import { supaAdmin } from '@/lib/nutrition'
import { todayBerlin } from '@/lib/explore/fetch'
import { validateTag } from '@/lib/explore/tags'
import { loadManualTags, rowToManualTag, describe, EXPLORE_TAGS_USER } from '@/lib/explore/tagsDb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Tag not found' }, { status: 404 })

  let body: { label?: unknown; start?: unknown; end?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const client = supaAdmin()
    const manual = await loadManualTags(client)
    const current = manual.find(t => t.id === id)
    if (!current) return Response.json({ error: 'Tag not found' }, { status: 404 })

    const merged = {
      label: body.label !== undefined ? body.label : current.label,
      start: body.start !== undefined ? body.start : current.start,
      end:   body.end   !== undefined ? body.end   : current.end,
      note:  body.note  !== undefined ? body.note  : current.note,
    }
    const v = validateTag(merged, manual, todayBerlin(), id)
    if (!v.ok) return Response.json(v, { status: v.status })

    const { data, error } = await client
      .from('explore_tags')
      .update({ label: v.value.label, start_date: v.value.start, end_date: v.value.end, note: v.value.note, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', EXPLORE_TAGS_USER)
      .select('id, label, start_date, end_date, note')
      .single()
    if (error) throw error
    return Response.json(rowToManualTag(data as Record<string, unknown>))
  } catch (e) {
    console.error('PATCH /api/explore/tags/[id] failed:', describe(e))
    return Response.json({ error: describe(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Tag not found' }, { status: 404 })

  try {
    const { data, error } = await supaAdmin()
      .from('explore_tags')
      .delete()
      .eq('id', id)
      .eq('user_id', EXPLORE_TAGS_USER)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) return Response.json({ error: 'Tag not found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/explore/tags/[id] failed:', describe(e))
    return Response.json({ error: describe(e) }, { status: 500 })
  }
}
