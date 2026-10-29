// Explore tags — server-only DB helpers for explore_tags (service role).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExploreTag } from './tags'

export const EXPLORE_TAGS_USER = 'julie'

export interface ManualTag extends ExploreTag {
  id: string
  source: 'manual'
}

export function rowToManualTag(r: Record<string, unknown>): ManualTag {
  return {
    id: r.id as string,
    label: r.label as string,
    start: r.start_date as string,
    end: r.end_date as string,
    source: 'manual',
    note: (r.note as string | null) ?? null,
  }
}

export async function loadManualTags(client: SupabaseClient): Promise<ManualTag[]> {
  const { data, error } = await client
    .from('explore_tags')
    .select('id, label, start_date, end_date, note')
    .eq('user_id', EXPLORE_TAGS_USER)
    .order('start_date', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(rowToManualTag)
}

// PostgrestError is a plain object — walk its fields rather than String(e).
// Same helper as app/api/nutrition/food-item/route.ts.
export function describe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const parts = [
      typeof obj.message === 'string' ? obj.message : null,
      typeof obj.code === 'string' ? `code=${obj.code}` : null,
      typeof obj.details === 'string' ? `details=${obj.details}` : null,
      typeof obj.hint === 'string' ? `hint=${obj.hint}` : null,
    ].filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(e)
  }
  return String(e)
}
