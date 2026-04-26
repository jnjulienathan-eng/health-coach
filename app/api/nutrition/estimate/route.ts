// POST /api/nutrition/estimate
//
// Accepts an optional base64-encoded image and/or a free-text description.
// At least one must be present. Calls Anthropic Vision and returns a JSON
// macro estimate — no DB writes happen here; the caller writes to meal_logs
// via POST /api/nutrition/meal when the user confirms Screen 5.
//
// Body: {
//   image?: string          // base64-encoded image data (no data-URI prefix)
//   image_media_type?: 'image/jpeg'|'image/png'|'image/gif'|'image/webp'
//   description?: string    // free-text, e.g. "grilled salmon ~150g, rice"
// }
//
// Response: {
//   meal_name: string
//   calories: number
//   protein_g: number
//   carbs_g: number
//   fat_g: number
//   fiber_g: number
//   confidence: 'high'|'medium'|'low'
// }

import Anthropic from '@anthropic-ai/sdk'

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

// Walk PostgrestError / generic object fields for a readable message.
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

function fail(stage: string, e: unknown, status = 500) {
  return Response.json({ error: `${stage}: ${describe(e)}`, stage }, { status })
}

const SYSTEM_PROMPT = `You are a nutrition analyst. The user will provide a meal photo and/or a text description.

Return ONLY a JSON object — no preamble, no explanation, no markdown fences. The object must have exactly these keys:
- meal_name (string): a short descriptive name for the meal
- calories (number): total estimated kilocalories
- protein_g (number): total estimated protein in grams
- carbs_g (number): total estimated carbohydrates in grams
- fat_g (number): total estimated fat in grams
- fiber_g (number): total estimated dietary fiber in grams
- confidence (string): one of "high", "medium", or "low"

Base confidence on how much information is available:
- "high": clear photo of a known dish OR detailed description with weights
- "medium": clear photo of ambiguous food OR description without weights
- "low": unclear photo, very vague description, or mixed signals

All numeric values must be non-negative numbers, not strings or null.`

// Strip accidental markdown fences the model may emit despite instructions.
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

export async function POST(req: Request) {
  let body: {
    image?: string
    image_media_type?: string
    description?: string
  }

  try {
    body = await req.json()
  } catch (e) {
    return fail('parse-body', e, 400)
  }

  const image = (body.image ?? '').trim()
  const description = (body.description ?? '').trim()

  if (!image && !description) {
    return Response.json(
      { error: 'At least one of image or description is required' },
      { status: 400 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fail('init-client', new Error('ANTHROPIC_API_KEY is not set'))
  }

  // Validate and resolve media type when an image is provided.
  let mediaType: MediaType = 'image/jpeg'
  if (image) {
    const raw = (body.image_media_type ?? '').trim().toLowerCase()
    const allowed: MediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (raw && allowed.includes(raw as MediaType)) {
      mediaType = raw as MediaType
    } else if (!raw) {
      // Best-effort sniff from the base64 prefix.
      if (image.startsWith('iVBOR')) mediaType = 'image/png'
      else if (image.startsWith('R0lGO')) mediaType = 'image/gif'
      else if (image.startsWith('UklGR')) mediaType = 'image/webp'
      // else default jpeg
    }
  }

  // Build the user message content blocks.
  type ContentBlock =
    | { type: 'image'; source: { type: 'base64'; media_type: MediaType; data: string } }
    | { type: 'text'; text: string }

  const content: ContentBlock[] = []

  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: image },
    })
  }

  const userText = description
    ? description
    : 'Please estimate the macros for this meal.'
  content.push({ type: 'text', text: userText })

  let rawText: string
  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const firstBlock = message.content[0]
    if (!firstBlock || firstBlock.type !== 'text') {
      return fail('parse-response', new Error('Unexpected response shape from Anthropic'))
    }
    rawText = firstBlock.text
  } catch (e) {
    return fail('anthropic-call', e)
  }

  let parsed: {
    meal_name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
    confidence: 'high' | 'medium' | 'low'
  }

  try {
    parsed = JSON.parse(stripFences(rawText))
  } catch (e) {
    return fail(
      'parse-json',
      new Error(`Could not parse model response as JSON. Raw: ${rawText.slice(0, 200)}`),
    )
  }

  // Validate required fields before returning.
  const numericFields = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const
  for (const field of numericFields) {
    if (typeof parsed[field] !== 'number' || parsed[field] < 0) {
      return fail(
        'validate-response',
        new Error(`Field "${field}" is missing or negative in model response`),
      )
    }
  }
  if (!['high', 'medium', 'low'].includes(parsed.confidence)) {
    parsed.confidence = 'medium'
  }
  if (typeof parsed.meal_name !== 'string' || !parsed.meal_name.trim()) {
    parsed.meal_name = 'Estimated meal'
  }

  return Response.json({
    meal_name: parsed.meal_name.trim(),
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fiber_g: parsed.fiber_g,
    confidence: parsed.confidence,
  })
}
