import * as THREE from 'three'
import fresnelVert from './shaders/fresnel.vert?raw'
import fresnelFrag from './shaders/fresnel.frag?raw'

// ---------------------------------------------------------------------------
// Minimal 3D Simplex Noise (inlined to avoid heavy dependency)
// Based on Stefan Gustavson's simplex noise implementation
// ---------------------------------------------------------------------------

const F3 = 1.0 / 3.0
const G3 = 1.0 / 6.0

// Permutation table (doubled to avoid index wrapping)
const perm: number[] = []
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
]

// Seed the permutation table
;(function initPerm() {
  const p: number[] = []
  for (let i = 0; i < 256; i++) p[i] = i
  // Deterministic shuffle (consistent brain shape)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor((i + 1) * 0.5) % (i + 1)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
})()

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z
}

function simplex3(x: number, y: number, z: number): number {
  const s = (x + y + z) * F3
  const i = Math.floor(x + s)
  const j = Math.floor(y + s)
  const k = Math.floor(z + s)
  const t = (i + j + k) * G3
  const X0 = i - t
  const Y0 = j - t
  const Z0 = k - t
  const x0 = x - X0
  const y0 = y - Y0
  const z0 = z - Z0

  let i1: number, j1: number, k1: number
  let i2: number, j2: number, k2: number

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    }
  }

  const x1 = x0 - i1 + G3
  const y1 = y0 - j1 + G3
  const z1 = z0 - k1 + G3
  const x2 = x0 - i2 + 2.0 * G3
  const y2 = y0 - j2 + 2.0 * G3
  const z2 = z0 - k2 + 2.0 * G3
  const x3 = x0 - 1.0 + 3.0 * G3
  const y3 = y0 - 1.0 + 3.0 * G3
  const z3 = z0 - 1.0 + 3.0 * G3

  const ii = i & 255
  const jj = j & 255
  const kk = k & 255

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
  if (t0 >= 0) {
    const gi0 = perm[ii + perm[jj + perm[kk]]] % 12
    t0 *= t0
    n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0)
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
  if (t1 >= 0) {
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12
    t1 *= t1
    n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1)
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
  if (t2 >= 0) {
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12
    t2 *= t2
    n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2)
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
  if (t3 >= 0) {
    const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12
    t3 *= t3
    n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3)
  }

  // Scale to [-1, 1]
  return 32.0 * (n0 + n1 + n2 + n3)
}

/** Fractal Brownian Motion with 3D simplex noise */
function fbm3(x: number, y: number, z: number, octaves: number, frequency: number, amplitude: number): number {
  let value = 0
  let amp = amplitude
  let freq = frequency
  for (let i = 0; i < octaves; i++) {
    value += amp * simplex3(x * freq, y * freq, z * freq)
    freq *= 2.0
    amp *= 0.5
  }
  return value
}

// ---------------------------------------------------------------------------
// BrainShell — deformed icosphere with Fresnel shader
// ---------------------------------------------------------------------------

export interface BrainShellOptions {
  radius?: number
  detail?: number
  noiseFrequency?: number
  noiseAmplitude?: number
  noiseOctaves?: number
  color?: string
  baseOpacity?: number
  edgeOpacity?: number
  fresnelPower?: number
}

const DEFAULTS: Required<BrainShellOptions> = {
  radius: 80,
  detail: 4,
  noiseFrequency: 0.8,
  noiseAmplitude: 0.3,
  noiseOctaves: 3,
  color: '#4488cc',
  baseOpacity: 0.08,
  edgeOpacity: 0.3,
  fresnelPower: 2.0
}

export class BrainShell {
  readonly mesh: THREE.Mesh
  readonly radius: number

  private material: THREE.ShaderMaterial

  constructor(opts: BrainShellOptions = {}) {
    const cfg = { ...DEFAULTS, ...opts }
    this.radius = cfg.radius

    // Build deformed icosphere geometry
    const geometry = new THREE.IcosahedronGeometry(cfg.radius, cfg.detail)
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const normal = geometry.attributes.normal as THREE.BufferAttribute

    for (let i = 0; i < pos.count; i++) {
      const nx = normal.getX(i)
      const ny = normal.getY(i)
      const nz = normal.getZ(i)

      // Sample noise at the normalised direction (unit sphere) to get a
      // consistent displacement regardless of vertex density.
      const displacement = fbm3(nx, ny, nz, cfg.noiseOctaves, cfg.noiseFrequency, cfg.noiseAmplitude)

      // Displace vertex along its normal
      const scale = 1.0 + displacement
      pos.setXYZ(
        i,
        pos.getX(i) * scale,
        pos.getY(i) * scale,
        pos.getZ(i) * scale
      )
    }

    geometry.computeVertexNormals()
    pos.needsUpdate = true

    // Fresnel shader material
    const color = new THREE.Color(cfg.color)
    this.material = new THREE.ShaderMaterial({
      vertexShader: fresnelVert,
      fragmentShader: fresnelFrag,
      uniforms: {
        uColor: { value: color },
        uBaseOpacity: { value: cfg.baseOpacity },
        uEdgeOpacity: { value: cfg.edgeOpacity },
        fresnelPower: { value: cfg.fresnelPower },
        uTime: { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    // Render behind everything else
    this.mesh.renderOrder = -1
  }

  /** Update time uniform for animated Fresnel pulse */
  updateTime(time: number): void {
    this.material.uniforms.uTime.value = time
  }

  /** Constrain a position vector to 85% of the shell radius */
  clampToShell(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const maxR = this.radius * 0.85
    const r = Math.sqrt(x * x + y * y + z * z)
    if (r > maxR && r > 0) {
      const scale = maxR / r
      return { x: x * scale, y: y * scale, z: z * scale }
    }
    return { x, y, z }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
