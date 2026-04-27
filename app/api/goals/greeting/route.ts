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
      system: `You are BodyCipher, a personal health coach. Write a single short greeting for Julie — witty, warm, specific to her data, never generic fitness-app language. Never mention cycle day. Max 2 sentences. Address her directly as "Julie" (in green — but you just write the text, no markup). Keep it punchy. Total response must be under 30 words. Every word must earn its place.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const greeting = (msg.content[0] as { text: string }).text.trim()
    return NextResponse.json({ greeting })
  } catch (err) {
    console.error('Greeting API error:', err)
    return NextResponse.json({ error: 'Failed to generate greeting' }, { status: 500 })
  }
}
