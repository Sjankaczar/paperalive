import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

let _landmarker = null
let _initPromise = null

/**
 * Lazy-init MediaPipe PoseLandmarker singleton.
 * @returns {Promise<PoseLandmarker>}
 */
export async function initPoseLandmarker() {
  if (_landmarker) return _landmarker
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    _landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
    })
    return _landmarker
  })()

  return _initPromise
}

// [jointId, landmarkIdx] or [jointId, [idxA, idxB]] for midpoints
const LANDMARK_MAP = [
  ['head',       0],
  ['neck',       [11, 12]],
  ['l_shoulder', 11],
  ['r_shoulder', 12],
  ['l_elbow',    13],
  ['r_elbow',    14],
  ['l_wrist',    15],
  ['r_wrist',    16],
  ['l_hip',      23],
  ['r_hip',      24],
  ['l_knee',     25],
  ['r_knee',     26],
  ['l_ankle',    27],
  ['r_ankle',    28],
]

/**
 * Detect 14 humanoid joints using MediaPipe PoseLandmarker.
 * Returns same schema as estimateSkeleton().
 * Throws if no pose detected — caller falls back to estimateSkeleton.
 *
 * @param {ImageData} imageData
 * @returns {Promise<import('../types/characterData.js').JointPositionList>}
 */
export async function detectPoseJoints(imageData) {
  const landmarker = await initPoseLandmarker()
  const { width, height } = imageData

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(imageData, 0, 0)

  const result = landmarker.detect(canvas)
  if (!result.landmarks?.length) throw new Error('No pose detected')

  const lm = result.landmarks[0]
  return LANDMARK_MAP.map(([id, idx]) => {
    const nx = Array.isArray(idx) ? (lm[idx[0]].x + lm[idx[1]].x) / 2 : lm[idx].x
    const ny = Array.isArray(idx) ? (lm[idx[0]].y + lm[idx[1]].y) / 2 : lm[idx].y
    return {
      id,
      x: Math.round(Math.max(0, Math.min(width - 1, nx * width))),
      y: Math.round(Math.max(0, Math.min(height - 1, ny * height))),
    }
  })
}
