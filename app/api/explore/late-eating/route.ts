// GET /api/explore/late-eating
// Late eating view: one row per night from OURA_START_DATE to today
// (Berlin) with kcal / carbs logged in the 3 hours before Oura bedtime,
// bedtime deviation, training flag and the overnight outcomes, plus the
// nights left out and why. Filtering and grouping happen client-side.
// See BODYCIPHER.md → EXPLORE → Late eating.

import { loadLateEatingData } from '@/lib/explore/fetch'
import { describe } from '@/lib/explore/tagsDb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    return Response.json(await loadLateEatingData())
  } catch (e) {
    console.error('GET /api/explore/late-eating failed:', describe(e))
    return Response.json({ error: describe(e) }, { status: 500 })
  }
}
