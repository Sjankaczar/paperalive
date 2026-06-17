/**
 * @file arapTestFixture.js
 * @description Shared test fixtures for ARAP module tests.
 */

/**
 * Build a simple grid mesh for testing.
 * Grid: gridW × gridH vertices, each cell → 2 triangles.
 *
 * @param {number} [gridW=4] - Grid width in vertices
 * @param {number} [gridH=4] - Grid height in vertices
 * @param {number} [spacing=10] - Spacing between grid points
 * @returns {import('../types/characterData.js').RawMesh}
 */
export function makeGridMesh(gridW = 4, gridH = 4, spacing = 10) {
  const vertexCount = gridW * gridH
  const vertices = new Float32Array(vertexCount * 2)

  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      const idx = row * gridW + col
      vertices[idx * 2] = col * spacing
      vertices[idx * 2 + 1] = row * spacing
    }
  }

  const triList = []
  for (let row = 0; row < gridH - 1; row++) {
    for (let col = 0; col < gridW - 1; col++) {
      const tl = row * gridW + col
      const tr = tl + 1
      const bl = (row + 1) * gridW + col
      const br = bl + 1
      triList.push(tl, bl, tr)
      triList.push(tr, bl, br)
    }
  }

  const triangles = new Uint16Array(triList)
  const triangleCount = triList.length / 3

  // Adjacency
  const neighbors = new Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    neighbors[i] = []
  }
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
    if (!neighbors[a].includes(b)) neighbors[a].push(b)
    if (!neighbors[a].includes(c)) neighbors[a].push(c)
    if (!neighbors[b].includes(a)) neighbors[b].push(a)
    if (!neighbors[b].includes(c)) neighbors[b].push(c)
    if (!neighbors[c].includes(a)) neighbors[c].push(a)
    if (!neighbors[c].includes(b)) neighbors[c].push(b)
  }

  // Boundary flags
  const isBoundary = new Array(vertexCount)
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      const idx = row * gridW + col
      isBoundary[idx] = row === 0 || row === gridH - 1 || col === 0 || col === gridW - 1
    }
  }

  // UV coords
  const width = (gridW - 1) * spacing
  const height = (gridH - 1) * spacing
  const uvCoords = new Float32Array(vertexCount * 2)
  for (let i = 0; i < vertexCount; i++) {
    uvCoords[i * 2] = vertices[i * 2] / width
    uvCoords[i * 2 + 1] = vertices[i * 2 + 1] / height
  }

  return {
    vertices,
    triangles,
    uvCoords,
    neighbors,
    isBoundary,
    vertexCount,
    triangleCount,
    width,
    height,
    centroid: [width / 2, height / 2],
    vertexBudgetExceeded: false,
  }
}

/**
 * Build a degenerate mesh where all triangles are extremely obtuse.
 * This should trigger uniform weight fallback in ARAPPrecompute.
 *
 * @returns {import('../types/characterData.js').RawMesh}
 */
export function makeDegenerateMesh() {
  // Very thin triangles: nearly collinear vertices
  // 18 vertices forming 6 triangles — all very flat
  const vertices = new Float32Array([
    0, 0,        100, 0.001,   50, 0.0005,
    0, 0.002,    100, 0.003,   50, 0.0025,
    50, 0.0005,  100, 0.001,  50, 0.0025,
    0, 0,         50, 0.0005,   0, 0.002,
    50, 0.0025,  100, 0.003,    0, 0.002,
    100, 0.001,  100, 0.003,   50, 0.0025,
    0, 0,          0, 0.002,   50, 0.0025,
    0, 0,         50, 0.0025, 100, 0.001,
    100, 0.001,   50, 0.0025, 100, 0.003,
    0, 0.002,    100, 0.003,   50, 0.0005,
    50, 0.0005,    0, 0.002,  50, 0.0025,
    100, 0.001,   50, 0.0005,   0, 0,
    0, 0.002,     50, 0.0025, 100, 0.003,
    50, 0.0005,    0, 0,      100, 0.001,
    50, 0.0025,   50, 0.0005,   0, 0.002,
    100, 0.003,  100, 0.001,  50, 0.0005,
    0, 0,         50, 0.0005,  50, 0.0025,
    0, 0.002,     50, 0.0025,  50, 0.0005,
  ])

  const vertexCount = vertices.length / 2
  const triCount = vertexCount / 3

  const triangles = new Uint16Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    triangles[i] = i
  }

  // Adjacency
  const neighbors = new Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    neighbors[i] = []
  }
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
    if (!neighbors[a].includes(b)) neighbors[a].push(b)
    if (!neighbors[a].includes(c)) neighbors[a].push(c)
    if (!neighbors[b].includes(a)) neighbors[b].push(a)
    if (!neighbors[b].includes(c)) neighbors[b].push(c)
    if (!neighbors[c].includes(a)) neighbors[c].push(a)
    if (!neighbors[c].includes(b)) neighbors[c].push(b)
  }

  const isBoundary = new Array(vertexCount).fill(true)

  const width = 100
  const height = 1
  const uvCoords = new Float32Array(vertexCount * 2)
  for (let i = 0; i < vertexCount; i++) {
    uvCoords[i * 2] = vertices[i * 2] / width
    uvCoords[i * 2 + 1] = vertices[i * 2 + 1] / height
  }

  return {
    vertices,
    triangles,
    uvCoords,
    neighbors,
    isBoundary,
    vertexCount,
    triangleCount: triCount,
    width,
    height,
    centroid: [50, 0.001],
    vertexBudgetExceeded: false,
  }
}

/**
 * Build a mock CharacterData for ARAPSolver tests.
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @param {import('../types/characterData.js').ARAPData} arapData
 * @param {import('../types/characterData.js').PinMapping} pinMapping
 * @returns {import('../types/characterData.js').CharacterData}
 */
export function makeCharacterData(mesh, arapData, pinMapping) {
  const n = mesh.vertexCount
  const vertices0 = new Float32Array(mesh.vertices)
  const verticesCurrent = new Float32Array(mesh.vertices)

  return {
    meta: {
      version: '2.0',
      createdAt: Date.now(),
      characterType: 'humanoid',
      jointCount: pinMapping.length,
      stats: {
        vertexCount: n,
        triangleCount: mesh.triangleCount,
        contourPoints: 0,
        dpEpsilon: 0,
        preprocessMs: 0,
      },
      name: 'TestCharacter',
    },
    image: { idbKey: 'test', width: mesh.width, height: mesh.height },
    geometry: {
      vertices0,
      verticesCurrent,
      vertexCount: n,
      triangles: mesh.triangles,
      triangleCount: mesh.triangleCount,
      uvCoords: mesh.uvCoords,
      neighbors: mesh.neighbors,
      isBoundary: mesh.isBoundary,
    },
    skeleton: {
      joints: new Map(),
      bones: new Map(),
      rootId: 'neck',
      currentPositions: new Map(),
    },
    pinMapping,
    partGroups: {
      triangleGroups: [],
      groupToTriangles: new Map(),
    },
    arap: arapData,
  }
}
