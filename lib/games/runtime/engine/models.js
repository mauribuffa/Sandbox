// ---------------------------------------------------------------------------
// models.js — a cast of low-poly props built from primitives, not loaded.
//
// Needs: THREE, materials.js (PALETTE, flat, unlit, textTexture, checkerTexture)
// Gives you: makeGround, makeSkyDome, makeCharacter, makeRobot, makeCar,
//            makeShip, makeCoin, makeGem, makeCrate, makeBarrel, makeTree,
//            makeRock, makeCloud, makeHeart, makeSpike, makeRing, makeLogoCube,
//            makeStarfield, makeLabel, makeInstancedField, measure
//
// There is no .glb to load here, so every model is boxes, spheres and cylinders
// in a Group. That is a smaller constraint than it sounds: faceted primitives in
// a confident palette are a whole legitimate art style, and unlike a downloaded
// model they cost nothing to load and cannot arrive broken.
//
// Two conventions everything here follows, and both are worth knowing because
// breaking either produces a bug that looks like a physics problem:
//
//   Origin at the feet. A model's origin sits on the ground, so
//   `model.position.y = 0` stands it on the floor rather than burying half of it.
//
//   +Z is forward. `Object3D.lookAt` points a mesh's +Z axis at its target (the
//   camera is the exception — its forward is -Z), so a model built facing +Z can
//   be aimed with `enemy.lookAt(player.position)` and driven by
//   `rotation.y = Math.atan2(dx, dz)` with no correction anywhere.
//
// `measure` writes `userData.radius` and `userData.height` for collision.
// ---------------------------------------------------------------------------

const _box = new THREE.Box3()
const _size = new THREE.Vector3()

// Records a bounding radius and height on the group. physics.js reads these, so
// a custom model only has to call `measure` to work with everything else.
function measure(group) {
  _box.setFromObject(group)
  _box.getSize(_size)
  group.userData.height = _size.y
  // Horizontal radius: a character is a vertical capsule, and using the full
  // 3D diagonal would give it a collision bubble as wide as it is tall.
  group.userData.radius = Math.max(_size.x, _size.z) / 2
  return group
}

// Lifts a group until its lowest point rests on y = 0. Needed wherever the
// shape's extent is not known in advance — a jittered rock, a cloud of spheres
// at random offsets — since a hard-coded offset there is a guess that sinks the
// model into the floor when the randomness goes the other way.
function standOnFloor(group) {
  _box.setFromObject(group)
  group.position.y -= _box.min.y
  return group
}

function part(geometry, material, position = [0, 0, 0], rotation = null) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// --- World ------------------------------------------------------------------

function makeGround(options = {}) {
  const {
    size = 120,
    color = PALETTE.inkSoft,
    checker = null, // ["#171a22", "#0b0d12"] to tile a board
    repeat = 24,
    grid = false,
    gridColor = PALETTE.brand,
  } = options

  const group = new THREE.Group()
  const material = flat(color, { roughness: 0.95, metalness: 0, flatShading: false })

  if (checker) {
    const texture = checkerTexture(checker[0], checker[1], { squares: 2 })
    texture.repeat.set(repeat, repeat)
    material.map = texture
    material.needsUpdate = true
  }

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  group.add(plane)

  if (grid) {
    const helper = new THREE.GridHelper(size, size / 2, gridColor, gridColor)
    helper.material.transparent = true
    helper.material.opacity = 0.18
    helper.position.y = 0.01 // clear of the plane, or the two z-fight
    group.add(helper)
  }

  return group
}

// A vertical gradient painted on the inside of a sphere. Cheaper and more
// controllable than a cube map, and it needs no images.
function makeSkyDome(options = {}) {
  const { top = 0x1e3a8a, bottom = 0xea580c, radius = 300, exponent = 0.7 } = options

  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      exponent: { value: exponent },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float exponent;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0);

        // Without these two the sky is the one thing in the scene that skips
        // the renderer's tone mapping and sRGB conversion, and it reads as a
        // washed-out band that does not match anything around it.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, // seen from inside
    depthWrite: false,
    fog: false,
  })

  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material)
}

function makeStarfield(count = 800, radius = 260) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()

  for (let i = 0; i < count; i++) {
    // Points scattered in a shell, not a ball: stars inside the play area would
    // drift past the camera like snow.
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() * 0.6,
      Math.random() - 0.5
    )
      .normalize()
      .multiplyScalar(radius * (0.8 + Math.random() * 0.2))

    positions.set([direction.x, direction.y, direction.z], i * 3)
    color.setHSL(0.08 + Math.random() * 0.08, 0.3, 0.6 + Math.random() * 0.4)
    colors.set([color.r, color.g, color.b], i * 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 1.4,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  )
}

// --- Characters and vehicles ------------------------------------------------

function makeCharacter(options = {}) {
  const { color = PALETTE.brand, accent = PALETTE.cream, height = 1.8 } = options
  const group = new THREE.Group()

  const bodyRadius = height * 0.22
  const bodyHeight = height * 0.5
  const body = part(
    new THREE.CapsuleGeometry(bodyRadius, bodyHeight, 6, 12),
    flat(color),
    [0, bodyHeight / 2 + bodyRadius, 0]
  )

  const head = part(
    new THREE.SphereGeometry(bodyRadius * 0.85, 16, 12),
    flat(accent),
    [0, height * 0.82, 0]
  )

  const eyeGeometry = new THREE.SphereGeometry(bodyRadius * 0.16, 8, 8)
  const eyeMaterial = flat(PALETTE.ink, { roughness: 0.2 })
  const eyeX = bodyRadius * 0.34
  const eyeZ = bodyRadius * 0.72

  // Eyes are the cheapest way to tell the player which way a character is
  // facing, and they are what makes the +Z convention visible.
  const left = part(eyeGeometry, eyeMaterial, [-eyeX, height * 0.86, eyeZ])
  const right = part(eyeGeometry, eyeMaterial, [eyeX, height * 0.86, eyeZ])

  group.add(body, head, left, right)
  return measure(group)
}

function makeRobot(options = {}) {
  const { color = PALETTE.slate, accent = PALETTE.teal } = options
  const group = new THREE.Group()

  group.add(
    part(new THREE.BoxGeometry(0.9, 1.1, 0.6), flat(color), [0, 1.05, 0]),
    part(new THREE.BoxGeometry(0.7, 0.55, 0.55), flat(color), [0, 1.9, 0]),
    part(new THREE.BoxGeometry(0.5, 0.14, 0.05), flat(accent, { emissive: accent, emissiveIntensity: 1.4 }), [0, 1.95, 0.3]),
    part(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 8), flat(accent), [-0.6, 1.1, 0]),
    part(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 8), flat(accent), [0.6, 1.1, 0]),
    part(new THREE.BoxGeometry(0.28, 0.5, 0.3), flat(color), [-0.24, 0.25, 0]),
    part(new THREE.BoxGeometry(0.28, 0.5, 0.3), flat(color), [0.24, 0.25, 0])
  )

  return measure(group)
}

function makeCar(options = {}) {
  const { color = PALETTE.red, accent = PALETTE.ink } = options
  const group = new THREE.Group()

  group.add(
    part(new THREE.BoxGeometry(1.5, 0.45, 3), flat(color), [0, 0.5, 0]),
    part(new THREE.BoxGeometry(1.2, 0.45, 1.4), flat(color), [0, 0.92, -0.2]),
    part(new THREE.BoxGeometry(1.05, 0.3, 1.1), flat(PALETTE.blue, { roughness: 0.1, metalness: 0.4 }), [0, 0.95, 0.15])
  )

  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12)
  const wheelMaterial = flat(accent, { roughness: 0.9 })
  for (const [x, z] of [[-0.78, 0.95], [0.78, 0.95], [-0.78, -0.95], [0.78, -0.95]]) {
    group.add(part(wheel, wheelMaterial, [x, 0.34, z], [0, 0, Math.PI / 2]))
  }

  return measure(group)
}

function makeShip(options = {}) {
  const { color = PALETTE.cream, accent = PALETTE.brand } = options
  const group = new THREE.Group()

  // The cone points +Y untouched; rotating it +90 degrees about X lays the nose
  // along +Z, which is the direction `lookAt` and `atan2(dx, dz)` both aim.
  group.add(
    part(new THREE.ConeGeometry(0.5, 1.8, 6), flat(color), [0, 0, 0], [Math.PI / 2, 0, 0]),
    part(new THREE.BoxGeometry(2.2, 0.1, 0.6), flat(accent), [0, -0.05, -0.3]),
    part(new THREE.SphereGeometry(0.26, 12, 8), flat(PALETTE.blue, { emissive: PALETTE.blue, emissiveIntensity: 0.8 }), [0, 0.16, 0.1]),
    part(new THREE.CylinderGeometry(0.16, 0.24, 0.4, 8), flat(accent, { emissive: accent, emissiveIntensity: 2 }), [0, 0, -0.9], [Math.PI / 2, 0, 0])
  )

  return measure(group)
}

// --- Pickups and props ------------------------------------------------------

function makeCoin(color = PALETTE.yellow) {
  const group = new THREE.Group()
  const coin = part(
    new THREE.CylinderGeometry(0.4, 0.4, 0.08, 20),
    flat(color, { metalness: 0.7, roughness: 0.25, emissive: color, emissiveIntensity: 0.35 }),
    [0, 0.4, 0],
    [Math.PI / 2, 0, 0]
  )
  coin.castShadow = true
  group.add(coin)
  return measure(group)
}

function makeGem(color = PALETTE.violet) {
  const group = new THREE.Group()
  group.add(
    part(
      new THREE.OctahedronGeometry(0.42, 0),
      flat(color, { metalness: 0.4, roughness: 0.15, emissive: color, emissiveIntensity: 0.5 }),
      [0, 0.5, 0]
    )
  )
  return measure(group)
}

function makeHeart(color = PALETTE.red) {
  const group = new THREE.Group()
  const material = flat(color, { emissive: color, emissiveIntensity: 0.4 })
  const lobe = new THREE.SphereGeometry(0.22, 12, 10)

  group.add(
    part(lobe, material, [-0.15, 0.62, 0]),
    part(lobe, material, [0.15, 0.62, 0]),
    part(new THREE.ConeGeometry(0.31, 0.5, 12), material, [0, 0.32, 0], [Math.PI, 0, 0])
  )

  return measure(group)
}

function makeCrate(options = {}) {
  const { size = 1, color = PALETTE.brandDeep, edge = PALETTE.cream } = options
  const group = new THREE.Group()

  const box = part(new THREE.BoxGeometry(size, size, size), flat(color), [0, size / 2, 0])
  group.add(box)

  // Outlining the hard edges is what stops a cube reading as a flat square when
  // it happens to line up with the light.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.5 })
  )
  outline.position.copy(box.position)
  group.add(outline)

  return measure(group)
}

function makeBarrel(color = PALETTE.brand) {
  const group = new THREE.Group()
  group.add(
    part(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), flat(color), [0, 0.55, 0]),
    part(new THREE.TorusGeometry(0.43, 0.05, 6, 16), flat(PALETTE.slate), [0, 0.85, 0], [Math.PI / 2, 0, 0]),
    part(new THREE.TorusGeometry(0.43, 0.05, 6, 16), flat(PALETTE.slate), [0, 0.25, 0], [Math.PI / 2, 0, 0])
  )
  return measure(group)
}

function makeSpike(color = PALETTE.slate) {
  const group = new THREE.Group()
  group.add(part(new THREE.ConeGeometry(0.3, 1, 4), flat(color, { metalness: 0.5, roughness: 0.3 }), [0, 0.5, 0]))
  return measure(group)
}

function makeRing(options = {}) {
  const { radius = 2.2, tube = 0.18, color = PALETTE.brandLit } = options
  const group = new THREE.Group()
  group.add(
    part(
      new THREE.TorusGeometry(radius, tube, 8, 32),
      flat(color, { emissive: color, emissiveIntensity: 1.4 }),
      [0, radius + 0.4, 0]
    )
  )
  return measure(group)
}

// --- Scenery ----------------------------------------------------------------

function makeTree(options = {}) {
  const { trunk = 0x6b4423, leaves = PALETTE.green, height = 3 } = options
  const group = new THREE.Group()

  group.add(part(new THREE.CylinderGeometry(0.14, 0.2, height * 0.45, 6), flat(trunk), [0, height * 0.22, 0]))

  // Three shrinking cones: the cheapest shape that still reads as a tree, and
  // the slight rotation on each keeps a forest of them from looking cloned.
  for (let i = 0; i < 3; i++) {
    const scale = 1 - i * 0.25
    group.add(
      part(
        new THREE.ConeGeometry(0.75 * scale, height * 0.4, 7),
        flat(leaves),
        [0, height * (0.45 + i * 0.2), 0],
        [0, (i * Math.PI) / 5, 0]
      )
    )
  }

  return measure(group)
}

function makeRock(options = {}) {
  const { size = 0.8, color = PALETTE.slate, seed = Math.random() } = options
  const group = new THREE.Group()

  // A low-detail icosahedron with its vertices jittered: no two rocks alike,
  // one geometry's worth of work each.
  const geometry = new THREE.IcosahedronGeometry(size, 0)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const jitter = 0.82 + (Math.sin(i * 12.9898 + seed * 78.233) * 0.5 + 0.5) * 0.36
    positions.setXYZ(
      i,
      positions.getX(i) * jitter,
      positions.getY(i) * jitter,
      positions.getZ(i) * jitter
    )
  }
  // The lighting reads from the normals, and jittering positions left them
  // pointing where the vertices used to be.
  geometry.computeVertexNormals()

  group.add(part(geometry, flat(color, { roughness: 1 }), [0, size * 0.75, 0]))
  return measure(standOnFloor(group))
}

function makeCloud(options = {}) {
  const { color = PALETTE.white, puffs = 5, scale = 1 } = options
  const group = new THREE.Group()
  const material = flat(color, { roughness: 1, metalness: 0, flatShading: false })

  for (let i = 0; i < puffs; i++) {
    const size = (0.6 + Math.random() * 0.5) * scale
    group.add(
      part(new THREE.SphereGeometry(size, 10, 8), material, [
        (i - puffs / 2) * 0.7 * scale,
        Math.random() * 0.3 * scale,
        Math.random() * 0.4 * scale,
      ])
    )
  }

  // Clouds are lit, not lighting: a cloud casting a shadow map costs the same
  // as a building and reads as a stain on the ground.
  group.traverse((child) => (child.castShadow = false))
  return measure(standOnFloor(group))
}

// The product mark as geometry: an orange cube whose three visible faces are
// the mark's three cream tones, edges picked out in the lightest of them.
function makeLogoCube(size = 1.6) {
  const group = new THREE.Group()

  // Face order is [+X, -X, +Y, -Y, +Z, -Z]. Top brightest, front mid, right
  // dim — the same falloff the flat mark uses to imply a light up and to the left.
  const faces = [
    flat(PALETTE.creamDim, { flatShading: false }),
    flat(PALETTE.brandDeep, { flatShading: false }),
    flat(PALETTE.cream, { flatShading: false }),
    flat(PALETTE.brand, { flatShading: false }),
    flat(PALETTE.creamMid, { flatShading: false }),
    flat(PALETTE.brandDeep, { flatShading: false }),
  ]

  const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), faces)
  cube.castShadow = true
  cube.receiveShadow = true

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(cube.geometry),
    new THREE.LineBasicMaterial({ color: PALETTE.cream, transparent: true, opacity: 0.55 })
  )

  group.add(cube, outline)
  return measure(group)
}

// --- Text and crowds --------------------------------------------------------

// A floating label — a name tag, a damage number, a "PRESS SPACE". Sprites face
// the camera on their own, so text stays readable from any angle.
function makeLabel(text, options = {}) {
  const { scale = 1, ...textOptions } = options
  const texture = textTexture(text, textOptions)

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  sprite.scale.set(scale * texture.userData.aspect, scale, 1)
  sprite.userData.setText = (next) => {
    sprite.material.map.dispose()
    const updated = textTexture(next, textOptions)
    sprite.material.map = updated
    sprite.scale.set(scale * updated.userData.aspect, scale, 1)
  }

  return sprite
}

// A thousand trees as one draw call. Past roughly fifty copies of anything,
// this is the difference between a game that runs and one that stutters —
// each ordinary Mesh is its own draw call, an InstancedMesh is one for all of them.
//
//   makeInstancedField(new THREE.ConeGeometry(0.6, 2, 6), flat(PALETTE.green), 500,
//     (dummy, i) => { dummy.position.set(rand(), 0, rand()); dummy.rotation.y = rand() })
function makeInstancedField(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    place(dummy, i)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
