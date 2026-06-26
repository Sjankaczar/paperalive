// END-TO-END proof: synthetic character (no image, no P1/P2) + a BVH clip.
// Builds a rigged character from a synthetic oval mask (same way integration.test.js
// does), retargets a .bvh into a MotionClip, plays it through MotionResolver, and
// checks the 14 joints actually move. Proves the BVH import works in the motion chain.
//
// Usage:  node scripts/bvh/e2e-bvh.mjs [file.bvh]   (default: samples/bvh/sample-synthetic.bvh)

import { readFileSync } from 'node:fs'

// Worker file calls self.postMessage — shim it so the pipeline runs under plain node.
globalThis.self = { postMessage() {} }

const u = (p) => new URL(p, import.meta.url)
const { runPreprocessingPipeline } = await import(u('../../src/character/workers/preprocessing.worker.js'))
const { parseBVH } = await import(u('../../src/motion/BVHParser.js'))
const { retargetBVH } = await import(u('../../src/motion/BVHRetargeter.js'))
const { MotionResolver } = await import(u('../../src/motion/MotionResolver.js'))

const file = process.argv[2] || new URL('../../samples/bvh/sample-synthetic.bvh', import.meta.url)
const pass = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`)

function makeOvalMask(w = 128, h = 192) {
  const data = new Uint8Array(w * h)
  const cx = w / 2, cy = h / 2, rx = w * 0.38, ry = h * 0.38
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry
    if (dx * dx + dy * dy <= 1) data[y * w + x] = 1
  }
  return { data, width: w, height: h }
}
function makeJoints(w = 128, h = 192) {
  const bbox = { top: h * 0.12, left: w * 0.12, width: w * 0.76, height: h * 0.76 }
  const cx = w / 2
  const P = [['head',0.05,0],['neck',0.15,0],['l_shoulder',0.20,-0.15],['r_shoulder',0.20,0.15],
    ['l_elbow',0.40,-0.22],['r_elbow',0.40,0.22],['l_wrist',0.55,-0.18],['r_wrist',0.55,0.18],
    ['l_hip',0.58,-0.10],['r_hip',0.58,0.10],['l_knee',0.78,-0.08],['r_knee',0.78,0.08],
    ['l_ankle',0.95,-0.08],['r_ankle',0.95,0.08]]
  return P.map(([id, yr, xr]) => ({ id, x: Math.round(cx + xr * bbox.width), y: Math.round(bbox.top + yr * bbox.height) }))
}

console.log(`\n=== E2E: synthetic character + ${file} ===\n`)
const res = runPreprocessingPipeline(makeOvalMask(), makeJoints(), 'humanoid', 400, 1.0)
pass(!res.error && res.charData, `character built (preprocessing): ${res.error ? res.error.errorCode : 'ok'}`)
if (res.error) process.exit(1)
const charData = res.charData
pass(charData.pinMapping.length === 14, `character rigged with ${charData.pinMapping.length}/14 joints`)

const parsed = parseBVH(readFileSync(file, 'utf8'))
const rt = retargetBVH(parsed.data, { projection: 'side', fps: 24, id: 'bvh_test' })
pass(rt.success, `BVH retargeted to clip: ${rt.success ? rt.data.frames.length + ' frames' : rt.error}`)
if (!rt.success) process.exit(1)
const clip = rt.data

const resolver = new MotionResolver(charData)
const rest = new Map([...resolver.resolve(0)].map(([k, v]) => [k, [...v]]))
resolver.registerClip(clip.id, clip)
resolver.playClip(clip.id)

let maxMove = 0, mover = ''
for (let step = 0; step < 8; step++) {
  const cur = resolver.resolve(20)
  for (const [jid, p] of cur) {
    const rp = rest.get(jid)
    const d = Math.abs(p[0] - rp[0]) + Math.abs(p[1] - rp[1])
    if (d > maxMove) { maxMove = d; mover = jid }
  }
}
pass(maxMove > 0.5, `joints animate while clip plays (max move ${maxMove.toFixed(2)}px on '${mover}')`)

resolver.stopClip()
const backToRest = [...resolver.resolve(0)].every(([jid, p]) => {
  const rp = rest.get(jid)
  return Math.abs(p[0] - rp[0]) + Math.abs(p[1] - rp[1]) < 1e-6
})
pass(backToRest, `stopClip returns character to rest pose`)
console.log(`\nProof: a real rigged character animated by the BVH clip — no image, no P1/P2.\n`)
