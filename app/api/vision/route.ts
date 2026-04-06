import Anthropic from '@anthropic-ai/sdk'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const VALID_MEDIA_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(req: Request) {
  const body = await req.json()
  const image: string = body?.image ?? ''
  const mealType: string = body?.mealType ?? ''
  const rawMediaType: string = body?.mediaType ?? 'image/jpeg'
  const mediaType: ImageMediaType = VALID_MEDIA_TYPES.includes(rawMediaType as ImageMediaType)
    ? (rawMediaType as ImageMediaType)
    : 'image/jpeg'

  if (!image.trim()) {
    return Response.json({ error: 'No image provided' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system:
        'You are a precise nutrition expert. Analyse the food in this image and estimate macros for the portion shown. Return ONLY valid JSON with no markdown, no explanation, no backticks. Format: { description: string, protein: number, fiber: number, fat: number, carbs: number, calories: number }. Be realistic with portion sizes. If you cannot identify food clearly, return your best estimate with description noting uncertainty.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: image,
              },
            },
            {
              type: 'text',
              text: mealType
                ? `This is for a ${mealType} meal. Estimate the macros.`
                : 'Estimate the macros for this meal.',
            },
          ],
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('No JSON in response')

    const macros = JSON.parse(match[0]) as {
      description: string
      protein: number
      fiber: number
      fat: number
      carbs: number
      calories: number
    }

    return Response.json(macros)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Vision analysis failed'
    return Response.json({ error: msg }, { status: 500 })
  }
}
