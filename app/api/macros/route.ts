import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const body = await req.json()
  const description: string = body?.description ?? ''

  if (!description.trim()) {
    return Response.json({ error: 'No description provided' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Estimate macronutrients for this meal. Return ONLY valid JSON — no explanation, no markdown, no extra text.

Keys required: protein (g), fiber (g), fat (g), carbs (g), calories (kcal). All integers.

Context: home-cooked portions, health-conscious person in Germany. Portions are typical unless specified.

Meal: "${description}"

Example output: {"protein":35,"fiber":8,"fat":12,"carbs":45,"calories":430}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('No JSON in response')

    const macros = JSON.parse(match[0]) as {
      protein: number
      fiber: number
      fat: number
      carbs: number
      calories: number
    }

    return Response.json(macros)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Estimation failed'
    return Response.json({ error: msg }, { status: 500 })
  }
}
