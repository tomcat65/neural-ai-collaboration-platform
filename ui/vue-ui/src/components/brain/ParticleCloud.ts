import * as THREE from 'three'

export interface ParticleCloudOptions {
  count?: number
  radius?: number
  particleSize?: number
  opacity?: number
  color?: string
}

const DEFAULTS: Required<ParticleCloudOptions> = {
  count: 700,
  radius: 76, // slightly inside brain shell (80 * 0.95)
  particleSize: 0.3,
  opacity: 0.15,
  color: '#4488cc'
}

interface ParticleState {
  vx: number
  vy: number
  vz: number
}

export class ParticleCloud {
  readonly mesh: THREE.InstancedMesh
  readonly radius: number

  private particles: ParticleState[]
  private dummy: THREE.Object3D
  private count: number

  constructor(opts: ParticleCloudOptions = {}) {
    const cfg = { ...DEFAULTS, ...opts }
    this.count = cfg.count
    this.radius = cfg.radius

    // Small sphere geometry for each particle instance
    const geometry = new THREE.SphereGeometry(cfg.particleSize, 4, 4)
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cfg.color),
      transparent: true,
      opacity: cfg.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count)
    this.mesh.renderOrder = 0 // between shell (-1) and nodes (default)
    this.dummy = new THREE.Object3D()
    this.particles = []

    // Initialise particles at random positions inside the sphere
    for (let i = 0; i < this.count; i++) {
      const pos = this.randomPositionInSphere()
      this.dummy.position.set(pos.x, pos.y, pos.z)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)

      // Random slow drift velocity
      const speed = 0.5 + Math.random() * 1.0
      const dir = this.randomDirection()
      this.particles.push({
        vx: dir.x * speed,
        vy: dir.y * speed,
        vz: dir.z * speed
      })
    }

    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Advance particle positions by `delta` seconds */
  update(delta: number): void {
    const maxR = this.radius
    const maxR2 = maxR * maxR

    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i]
      this.mesh.getMatrixAt(i, this.dummy.matrix)
      this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale)

      // Move
      this.dummy.position.x += p.vx * delta
      this.dummy.position.y += p.vy * delta
      this.dummy.position.z += p.vz * delta

      // If outside bounds, respawn at a random position on the opposite side
      const dist2 =
        this.dummy.position.x * this.dummy.position.x +
        this.dummy.position.y * this.dummy.position.y +
        this.dummy.position.z * this.dummy.position.z

      if (dist2 > maxR2) {
        const pos = this.randomPositionInSphere()
        this.dummy.position.set(pos.x, pos.y, pos.z)

        // New random velocity
        const speed = 0.5 + Math.random() * 1.0
        const dir = this.randomDirection()
        p.vx = dir.x * speed
        p.vy = dir.y * speed
        p.vz = dir.z * speed
      }

      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }

    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Toggle visibility of the particle cloud (used by LOD system) */
  setVisible(visible: boolean): void {
    this.mesh.visible = visible
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    const mat = this.mesh.material
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose())
    } else {
      mat.dispose()
    }
  }

  // ------- helpers -------

  private randomPositionInSphere(): { x: number; y: number; z: number } {
    // Uniform distribution inside sphere using cube-root method
    const u = Math.random()
    const r = this.radius * Math.cbrt(u)
    const dir = this.randomDirection()
    return { x: dir.x * r, y: dir.y * r, z: dir.z * r }
  }

  private randomDirection(): { x: number; y: number; z: number } {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const sinPhi = Math.sin(phi)
    return {
      x: sinPhi * Math.cos(theta),
      y: sinPhi * Math.sin(theta),
      z: Math.cos(phi)
    }
  }
}
