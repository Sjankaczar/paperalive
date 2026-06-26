// BVH → MotionClip JSON converter
// Usage: node scripts/bvh/bvh-to-clip.mjs <file.bvh> <clipId> [front|side] [fps] [loop]
// Output: src/motion/clips/<clipId>.json
//
// Examples:
//   node scripts/bvh/bvh-to-clip.mjs downloads/walk.bvh walk front 24 true
//   node scripts/bvh/bvh-to-clip.mjs samples/bvh/pirouette.bvh dance front 24 true

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const { parseBVH }    = await import(new URL('../../src/motion/BVHParser.js', import.meta.url))
const { retargetBVH } = await import(new URL('../../src/motion/BVHRetargeter.js', import.meta.url))

const [,, bvhFile, clipId, projection = 'front', fpsStr = '24', loopStr = 'true'] = process.argv

if (!bvhFile || !clipId) {
  console.error('Usage: node scripts/bvh/bvh-to-clip.mjs <file.bvh> <clipId> [front|side] [fps] [loop]')
  process.exit(1)
}

const fps  = Number(fpsStr)
const loop = loopStr !== 'false'

console.log(`\n→ Parsing ${bvhFile} …`)
const text = readFileSync(bvhFile, 'utf8')

const parsed = parseBVH(text)
if (!parsed.success) {
  console.error(`✗ parseBVH failed: ${parsed.error} — ${parsed.message}`)
  process.exit(1)
}

const { joints, framesFK } = parsed.data
console.log(`  joints: ${joints.length}  frames: ${framesFK.length}`)

console.log(`→ Retargeting (projection=${projection}, fps=${fps}) …`)
const result = retargetBVH(parsed.data, { id: clipId, projection, fps, loop })

if (!result.success) {
  console.error(`✗ retargetBVH failed: ${result.error} — ${result.message}`)
  process.exit(1)
}

const clip = result.data
const mapped = Object.keys(clip.frames[0]?.joints || {})
console.log(`  mapped joints: ${mapped.length}/14  output frames: ${clip.frames.length}`)

if (mapped.length < 6) {
  console.warn(`⚠ Only ${mapped.length} joints mapped — motion may look incomplete.`)
  console.warn(`  Mapped: ${mapped.join(', ')}`)
}

const outPath = resolve(ROOT, `src/motion/clips/${clipId}.json`)
const json = JSON.stringify(clip, (k, v) =>
  typeof v === 'number' ? Math.round(v * 1000) / 1000 : v
)
writeFileSync(outPath, json)

console.log(`✓ Written → ${outPath}`)
console.log(`  ${clip.frames.length} frames @ ${clip.fps} fps  loop=${clip.loop}\n`)
