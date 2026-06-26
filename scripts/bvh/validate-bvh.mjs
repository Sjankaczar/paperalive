// Headless BVH validator — runs the REAL pipeline on a .bvh file, no browser.
// Usage:  node scripts/bvh/validate-bvh.mjs <file.bvh> [side|front]
//
// Checks: parse ok? FK produced? retarget ok? 14 joints mapped? offsets sane?
// root stripped? Prints a PASS/FAIL summary you can eyeball.

import { readFileSync } from 'node:fs'

const { parseBVH } = await import(new URL('../../src/motion/BVHParser.js', import.meta.url))
const { retargetBVH } = await import(new URL('../../src/motion/BVHRetargeter.js', import.meta.url))

const file = process.argv[2]
const projection = process.argv[3] || 'side'
if (!file) { console.error('Usage: node scripts/bvh/validate-bvh.mjs <file.bvh> [side|front]'); process.exit(1) }

const APP_JOINTS = ['head','neck','l_shoulder','r_shoulder','l_elbow','r_elbow','l_wrist','r_wrist','l_hip','r_hip','l_knee','r_knee','l_ankle','r_ankle']
const pass = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`)

const text = readFileSync(file, 'utf8')
console.log(`\n=== Validating ${file} (projection=${projection}) ===\n`)

const parsed = parseBVH(text)
pass(parsed.success, `parseBVH: ${parsed.success ? 'ok' : parsed.error + ' — ' + parsed.message}`)
if (!parsed.success) process.exit(1)

const { joints, framesFK, frameTime } = parsed.data
console.log(`   joints=${joints.length}  frames=${framesFK.length}  frameTime=${frameTime}s  (~${(1/frameTime).toFixed(0)}fps)`)
pass(joints.length > 0, `hierarchy parsed (${joints.length} joints incl. End Sites)`)
pass(framesFK.length > 0 && framesFK[0].length === joints.length, `FK produced ${framesFK.length} frames × ${joints.length} joints`)

const r = retargetBVH(parsed.data, { projection, fps: 24 })
pass(r.success, `retargetBVH: ${r.success ? 'ok' : r.error + ' — ' + r.message}`)
if (!r.success) process.exit(1)

const clip = r.data
console.log(`   clip id=${clip.id}  fps=${clip.fps}  loop=${clip.loop}  outFrames=${clip.frames.length}`)

const mapped = Object.keys(clip.frames[0].joints)
const missing = APP_JOINTS.filter(j => !mapped.includes(j))
pass(missing.length === 0, `mapped ${mapped.length}/14 joints` + (missing.length ? ` — MISSING: ${missing.join(', ')}` : ''))

const f0 = clip.frames[0].joints
const f0max = Math.max(...mapped.map(j => Math.abs(f0[j].dx) + Math.abs(f0[j].dy)))
pass(f0max < 1e-6, `frame 0 is rest pose (max offset ${f0max.toExponential(1)} ≈ 0)`)

const lastJ = clip.frames[clip.frames.length - 1].joints
const motion = Math.max(...mapped.map(j => Math.abs(lastJ[j].dx) + Math.abs(lastJ[j].dy)))
pass(motion > 0.01, `motion present (last-frame max offset ${motion.toFixed(2)})`)

const allMax = Math.max(...clip.frames.flatMap(f => mapped.map(j => Math.abs(f.joints[j].dx) + Math.abs(f.joints[j].dy))))
pass(allMax < 100, `offset magnitude sane (max ${allMax.toFixed(1)}; existing clips ~5-15)`)

const hasNaN = clip.frames.some(f => mapped.some(j => Number.isNaN(f.joints[j].dx) || Number.isNaN(f.joints[j].dy)))
pass(!hasNaN, `no NaN in offsets`)

console.log(`\nSample (joint 'l_wrist' over first 3 frames):`)
clip.frames.slice(0, 3).forEach((f, i) => {
  const w = f.joints.l_wrist
  if (w) console.log(`   f${i}: dx=${w.dx.toFixed(2)} dy=${w.dy.toFixed(2)}`)
})
console.log('')
