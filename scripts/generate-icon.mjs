import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '../public/apple-touch-icon.png')

// SVG mark — same paths as SplashScreen.tsx, viewBox="220 36 220 250"
// Rendered at 180×180 on a #0a0a0a background with comfortable padding.
const ICON_SIZE = 180
const PADDING = 24 // comfortable padding on each side
const INNER = ICON_SIZE - PADDING * 2 // 132px usable area

const svg = `
<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <!-- background -->
  <rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="#0a0a0a"/>

  <!-- mark scaled to fit inside the padded area.
       Original content occupies viewBox 220 36 220 250.
       We translate and scale so it fills the ${INNER}×${INNER} inner box
       starting at (${PADDING}, ${PADDING}).
       scale = ${INNER} / 250 = ${(INNER / 250).toFixed(6)}
       translateX = ${PADDING} - 220 * scale
       translateY = ${PADDING} - 36  * scale                        -->
  <g transform="translate(${(PADDING - 220 * (INNER / 250)).toFixed(3)}, ${(PADDING - 36 * (INNER / 250)).toFixed(3)}) scale(${(INNER / 250).toFixed(6)})">

    <!-- body form -->
    <path d="M 249,90 C 244,108 238,126 241,162"
          fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 242,200 C 240,222 242,252 245,272"
          fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 264,46 C 276,44 285,56 285,72 C 285,84 276,90 272,94 C 270,98 268,106 272,116
             C 276,122 288,122 292,128 C 294,134 280,150 258,160 C 258,167 274,177 278,188
             C 282,197 284,207 278,222 C 274,232 264,252 256,277 C 254,252 250,234 249,220
             C 248,208 249,197 250,188 C 251,178 251,168 251,160 C 251,150 249,138 238,128
             C 238,120 242,114 252,106 C 254,100 256,92 252,88 C 250,82 244,70 244,60
             C 246,50 254,44 264,46 Z"
          fill="rgba(255,255,255,0.95)"/>

    <!-- ECG line -->
    <polyline points="260,160 294,160 300,124 308,190 314,148 325,160 428,160"
              fill="none" stroke="white" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>

    <!-- amber dots -->
    <circle cx="260" cy="160" r="5.5" fill="#E8940A"/>
    <circle cx="428" cy="160" r="5.5" fill="#E8940A"/>
  </g>
</svg>
`.trim()

await sharp(Buffer.from(svg))
  .resize(ICON_SIZE, ICON_SIZE)
  .png()
  .toFile(outPath)

console.log(`Written: ${outPath}`)
