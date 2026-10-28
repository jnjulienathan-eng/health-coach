// GET /api/explore
// Explore tab data: the 60 chart dates ending today (Berlin). Per date:
// isSick, raw value + display string + z-score for each of the seven
// variables, daysSinceInjection; plus the GLP-1 injection dates in the
// window. Highlights are computed client-side (lib/explore/highlights.ts).
// See BODYCIPHER.md → EXPLORE.

import { loadExploreData } from '@/lib/explore/fetch'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// PostgrestError is a plain object — walk its fields rather than String(e).
// Same helper as app/api/nutrition/food-item/route.ts.
function describe(e: unknown): string {
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

export async function GET() {
  try {
    return Response.json(await loadExploreData())
  } catch (e) {
    console.error('GET /api/explore failed:', describe(e))
    return Response.json({ error: describe(e) }, { status: 500 })
  }
}
