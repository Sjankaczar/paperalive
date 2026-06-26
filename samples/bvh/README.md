# Sample BVH files

Test/demo motion-capture files for the BVH import feature (P3 BVHParser + P4 BVHRetargeter).

| File | Source / License | Notes |
|------|------------------|-------|
| `sample-synthetic.bvh` | Hand-built (this repo) | Tiny 4-frame skeleton, CMU-style joint names. Quick smoke test. |
| `pirouette.bvh` | [three.js](https://github.com/mrdoob/three.js) examples — MIT License | Real 57-joint, 592-frame @120fps mocap. Daz/Poser joint naming (`lShldr`, `lThigh`, …). |

## How to validate the BVH pipeline (no browser)

```bash
# Clip-level: parse → FK → retarget → MotionClip. Pass/fail summary.
node scripts/bvh/validate-bvh.mjs samples/bvh/pirouette.bvh side

# End-to-end: build a synthetic rigged character and animate it with the clip.
node scripts/bvh/e2e-bvh.mjs samples/bvh/pirouette.bvh

# Unit tests
npm test -- BVHParser BVHRetargeter
```

`side` / `front` selects the projection plane (default `side` — better for walk/run;
`front` better for waves). Neither validation needs an image, P1, or P2.

## Where to get more BVH files

- **Mixamo** (mixamo.com) — pick an animation → Download → Format: **BVH**. (`mixamorig:` joint names — supported.)
- **CMU Motion Capture Database** — the popular cgspeed "Daz-friendly" BVH release uses the same `lShldr`/`lThigh` naming as `pirouette.bvh` — supported.

Joint-name conventions handled by `JOINT_MAP` in `src/motion/BVHRetargeter.js`:
CMU standard (`LeftArm`, `LeftUpLeg`…), Mixamo (`mixamorig:*`), and Daz/Poser (`lShldr`, `lThigh`…).
