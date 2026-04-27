import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { timeOfDay, hrvBand, trainedToday } = await req.json() as {
      timeOfDay: string
      hrvBand: string
      trainedToday: boolean
    }

    const userPrompt = [
      `Time of day: ${timeOfDay}`,
      `HRV band: ${hrvBand}`,
      `Trained today: ${trainedToday ? 'yes' : 'no'}`,
    ].join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      system: `You are BodyCipher, a personal health coach with a dry wit. Write a single greeting for Julie — maximum 2 short sentences. First sentence must be 'Good [morning/afternoon/evening], Julie.' with the time of day filled in. Second sentence is one sharp, specific, occasionally deadpan observation about her data. Never give advice. Never be a cheerleader. Never mention cycle day. Think Muji meets dark humour.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const greeting = (msg.content[0] as { text: string }).text.trim()
    return NextResponse.json({ greeting })
  } catch (err) {
    console.error('Greeting API error:', err)
    return NextResponse.json({ error: 'Failed to generate greeting' }, { status: 500 })
  }
}
