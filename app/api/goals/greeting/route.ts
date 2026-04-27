import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const {
      timeOfDay, hrvBand, trainedToday,
      proteinLogged, proteinTarget,
      lastBedtime, sleepDuration, rested,
    } = await req.json() as {
      timeOfDay: string
      hrvBand: string
      trainedToday: boolean
      proteinLogged: number | null
      proteinTarget: number
      lastBedtime: string | null
      sleepDuration: number | null
      rested: number | null
    }

    const userPrompt = [
      `Time of day: ${timeOfDay}`,
      `HRV band: ${hrvBand}`,
      `Trained today: ${trainedToday ? 'yes' : 'no'}`,
      proteinLogged != null ? `Protein logged today: ${Math.round(proteinLogged)}g (target ${proteinTarget}g)` : 'Protein: not logged yet',
      lastBedtime ? `Last bedtime: ${lastBedtime}` : null,
      sleepDuration != null ? `Sleep duration: ${Math.round(sleepDuration / 60 * 10) / 10}h` : null,
      rested != null ? `Rested score: ${rested}/5` : null,
    ].filter(Boolean).join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      system: `You are BodyCipher, Julie's personal health coach. You have a dry wit — sharp, specific, occasionally deadpan, never cheesy or cheerleader-ish. Write exactly 2 sentences.

The first sentence must reference the time of day naturally but creatively — do NOT use 'Good morning/afternoon/evening' as an opener. Instead find a witty way to acknowledge the time or moment. Julie's name must appear somewhere in the first sentence.

The second sentence picks the single most interesting or slightly uncomfortable data point from what you've been given and makes one sharp, specific, occasionally pushy observation. Could be protein, sleep, HRV, training — whatever is most worth saying. Never give advice. Never be generic. Never mention cycle day. Think: sharp friend who looked at your data, not a fitness app.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const greeting = (msg.content[0] as { text: string }).text.trim()
    return NextResponse.json({ greeting })
  } catch (err) {
    console.error('Greeting API error:', err)
    return NextResponse.json({ error: 'Failed to generate greeting' }, { status: 500 })
  }
}
