// Fake WebXR runtime for testing the AR flow in a normal browser.
//
// Not shipped — a test harness. Loaded by `3d-babylon/?xrmock=1` before Babylon
// starts, so `navigator.xr` looks like a headset: an immersive-ar session with a
// render loop, hit-test sources that report whatever surface the fake viewer is
// looking at, detected planes, anchors, and two hands that can be posed and
// pinched.
//
// This exists because every AR bug so far has been found by a human wearing a
// Quest and reported in prose. Driving the real code path in a browser turns
// "spawns huge" into an assertion on a number.
//
// The fake room is 4 × 3 m with 2.5 m walls and a 0.75 m table — big enough that
// walking around it actually exercises room sense.
(function () {
  const FLOOR_Y = 0;
  const TABLE_Y = 0.75;
  const ROOM = { x0: -2, x1: 2, z0: -1.5, z1: 1.5, ceil: 2.5 };

  const ident = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  function transform(x, y, z, q) {
    const o = q || { x: 0, y: 0, z: 0, w: 1 };
    const m = ident(); m[12] = x; m[13] = y; m[14] = z;
    return {
      matrix: m,
      position: { x, y, z, w: 1 },
      orientation: o,
      inverse: { matrix: (() => { const i = ident(); i[12] = -x; i[13] = -y; i[14] = -z; return i; })() },
    };
  }

  class FakeSpace { constructor(tag) { this.tag = tag || ''; } }

  // ── the fake person ───────────────────────────────────────────────────────
  // Position + yaw of the headset, and where each hand is relative to it. The
  // test drives these; everything else in the mock is derived from them.
  // pitch matters: everything this app asks you to do — read a footprint on the
  // floor, watch dots paint in along it — happens below the horizon. A mock that
  // can only look straight ahead can't see any of it.
  const viewer = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };

  // Head basis: forward / right / up for the current yaw+pitch. Forward is −Z at
  // rest, which is the right-handed convention the scene uses.
  function basis() {
    const cy = Math.cos(viewer.yaw), sy = Math.sin(viewer.yaw);
    const cp = Math.cos(viewer.pitch), sp = Math.sin(viewer.pitch);
    return {
      f: { x: -sy * cp, y: sp, z: -cy * cp },
      r: { x: cy, y: 0, z: -sy },
      u: { x: -sy * -sp, y: cp, z: -cy * -sp },
    };
  }
  // Hand offsets are in HEAD-LOCAL space (right, up, forward) so "hands out in
  // front of you" stays true whichever way the fake person is facing.
  //
  // The default is hands DOWN at your sides. It started as hands-out-in-front,
  // which meant the fake person was permanently performing the placement
  // gesture and the room placed itself before any test could assert on it —
  // a mock that is always mid-gesture can't test a gesture.
  const handLocal = {
    left:  { r: -0.18, u: -0.62, f: 0.12 },
    right: { r:  0.18, u: -0.62, f: 0.12 },
  };
  // Hands hang off the head's YAW only — you don't want them swinging up and
  // down every time the fake person glances at the floor.
  function headToWorld(o) {
    const s = Math.sin(viewer.yaw), c = Math.cos(viewer.yaw);
    const fx = -s, fz = -c, rx = c, rz = -s;
    return {
      x: viewer.x + rx * o.r + fx * o.f,
      y: viewer.y + o.u,
      z: viewer.z + rz * o.r + fz * o.f,
    };
  }
  // q = qYaw · qPitch, so pitch is applied in head space.
  function headQuat() {
    const hy = viewer.yaw / 2, hp = viewer.pitch / 2;
    const cy = Math.cos(hy), sy = Math.sin(hy), cp = Math.cos(hp), sp = Math.sin(hp);
    return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
  }

  // The projection has to match the CANVAS ASPECT, computed live. It was
  // hard-coded to x=1.3, y=1.7 — an implied aspect of 1.31 against a 1.60
  // canvas, so every rendered frame was stretched 22 % horizontally and the
  // bathroom looked subtly skewed in the recordings. The model was never
  // skewed; the simulator's lens was.
  const FOV_Y = 1.05;   // ~60°, roughly a headset's vertical field of view
  function projection() {
    const cv = document.querySelector('canvas');
    const aspect = cv && cv.height ? cv.width / cv.height : 1.6;
    const f = 1 / Math.tan(FOV_Y / 2);
    const near = 0.05, far = 200;
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
  }

  // Ray-march the fake room so hit-test results actually move as the fake person
  // looks around — a mock that always returns the same point can't exercise
  // room-sense accumulation at all. Each hit carries the surface NORMAL, which
  // is what lets the viewer lay its detection patches flat on the surface
  // instead of floating spheres in mid-air.
  function castRay(ox, oy, oz, dx, dy, dz) {
    let best = null;
    const hit = (t, x, y, z, n) => {
      if (t <= 0.05 || t > 6) return;
      if (x < ROOM.x0 - 0.01 || x > ROOM.x1 + 0.01) return;
      if (z < ROOM.z0 - 0.01 || z > ROOM.z1 + 0.01) return;
      if (y < -0.01 || y > ROOM.ceil + 0.01) return;
      if (!best || t < best.t) best = { t, x, y, z, n };
    };
    // floor / ceiling / table top — normals face back into the room
    for (const py of [FLOOR_Y, ROOM.ceil, TABLE_Y]) {
      if (Math.abs(dy) < 1e-6) continue;
      const t = (py - oy) / dy;
      const x = ox + dx * t, z = oz + dz * t;
      if (py === TABLE_Y && (Math.abs(x) > 0.6 || Math.abs(z + 0.6) > 0.4)) continue;
      hit(t, x, py, z, [0, py === ROOM.ceil ? -1 : 1, 0]);
    }
    for (const px of [ROOM.x0, ROOM.x1]) {
      if (Math.abs(dx) < 1e-6) continue;
      const t = (px - ox) / dx;
      hit(t, px, oy + dy * t, oz + dz * t, [px < 0 ? 1 : -1, 0, 0]);
    }
    for (const pz of [ROOM.z0, ROOM.z1]) {
      if (Math.abs(dz) < 1e-6) continue;
      const t = (pz - oz) / dz;
      hit(t, ox + dx * t, oy + dy * t, pz, [0, 0, pz < 0 ? 1 : -1]);
    }
    return best;
  }

  // WebXR hit-test poses put the surface normal on the pose's +Y axis, so the
  // mock has to hand back an orientation that rotates +Y onto the real normal.
  function quatFromUp(n) {
    const [x, y, z] = n;
    if (y > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
    if (y < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };   // 180° about X
    // Half-way quaternion between (0,1,0) and n.
    const ax = z, az = -x;                                // cross((0,1,0), n)
    const w = 1 + y;
    const len = Math.hypot(ax, 0, az, w) || 1;
    return { x: ax / len, y: 0, z: az / len, w: w / len };
  }

  class FakeInputSource {
    constructor(handedness, hasHand) {
      this.handedness = handedness;
      this.targetRayMode = 'tracked-pointer';
      this.targetRaySpace = new FakeSpace('ray:' + handedness);
      this.gripSpace = new FakeSpace('grip:' + handedness);
      this.profiles = [];
      if (hasHand) {
        // 25 joints, keyed like the real XRHand map.
        const names = ['wrist',
          'thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
          'index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip',
          'middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip',
          'ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip',
          'pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
        const map = new Map();
        for (const n of names) map.set(n, new FakeSpace('joint:' + handedness + ':' + n));
        this.hand = map;
        this.hand.get = map.get.bind(map);
        this.jointNames = names;
      }
    }
    get pos() { return headToWorld(handLocal[this.handedness]); }
  }

  class FakeFrame {
    constructor(session) { this.session = session; }
    getViewerPose() {
      const t = transform(viewer.x, viewer.y, viewer.z, headQuat());
      return { transform: t, views: [{
        eye: 'none', transform: t, projectionMatrix: projection(),
      }] };
    }
    getPose(space) {
      const src = this.session._sources.find(s => s.targetRaySpace === space || s.gripSpace === space);
      if (src) { const p = src.pos; return { transform: transform(p.x, p.y, p.z, headQuat()) }; }
      if (this.session._anchors.has(space)) {
        const a = this.session._anchors.get(space);
        return { transform: transform(a.x, a.y, a.z) };
      }
      const plane = this.session._planeSpaces.get(space);
      if (plane) return { transform: transform(plane.x, plane.y, plane.z) };
      return { transform: transform(0, 0, 0) };
    }
    getJointPose(space) {
      for (const src of this.session._sources) {
        if (!src.hand) continue;
        for (const [name, sp] of src.hand) {
          if (sp !== space) continue;
          const base = headToWorld(handLocal[src.handedness]);
          const i = src.jointNames.indexOf(name);
          // A crude but WELL-FORMED hand. The first version laid every joint out
          // on one line, so cross(index−wrist, pinky−wrist) was degenerate and
          // normalized to NaN — which the viewer's flatPalm() read as "palm is
          // down" and placed the room off a hand that was doing nothing of the
          // kind. Fingers get a real lateral spread and a real length here, so
          // the palm normal is meaningful and the pose is what it says it is.
          // Derive finger and joint from the NAME. The arithmetic version
          // assumed four joints per finger, but the map has five for every
          // finger except the thumb — so index 9, 'index-finger-tip', came out
          // as finger 2 joint 0, i.e. a knuckle. Every fingertip in this mock
          // was silently in the wrong place, which is why a cupped hand had no
          // fingertip lift and the gesture could never fire.
          const finger = /thumb/.test(name) ? 0 : /index/.test(name) ? 1
                       : /middle/.test(name) ? 2 : /ring/.test(name) ? 3 : 4;
          const joint = i === 0 ? 0
                      : /metacarpal/.test(name) ? 0 : /proximal/.test(name) ? 1
                      : /intermediate/.test(name) ? 2 : /distal/.test(name) ? 3 : 4;
          const mirror = src.handedness === 'left' ? -1 : 1;
          const lateral = i === 0 ? 0 : mirror * (finger - 2) * 0.021;
          const along = i === 0 ? 0 : 0.03 + joint * 0.026;
          const down = this.session._palmDown[src.handedness];
          const up = this.session._palmUp[src.handedness];
          // Palm down: fingers away, normal −Y. Palm up: the same plane with
          // the lateral axis mirrored, which flips the cross product to +Y.
          // Otherwise: hand held up, fingers down, palm facing forward.
          // Palm UP means CUPPED, not flat: the fingers curl up out of the
          // palm, which is what the viewer looks for (a fingertip lift is
          // sign-free, unlike a palm normal). A flat palm-up hand produced zero
          // lift and the gesture could never fire.
          const flat = down || up;
          const dx = up ? -lateral : lateral;
          const dy = up ? joint * 0.017 : (down ? 0 : -along);
          const dz = flat ? -along : 0;
          return {
            transform: transform(base.x + dx, base.y + dy, base.z + dz),
            radius: name.endsWith('-tip') ? 0.008 : 0.011,
          };
        }
      }
      return null;
    }
    getHitTestResults(source) {
      if (!this.session._hitTest) return [];
      const o = source._origin === 'hand'
        ? headToWorld(handLocal[source._hand])
        : { x: viewer.x, y: viewer.y, z: viewer.z };
      // A hand held flat and palm-down points its ray at the surface underneath
      // it, not off across the room. Modelling that matters: the viewer's dwell
      // gesture only arms when the palm is 2–35 cm above where the marker sits,
      // so a mock whose palm-down hand still rays forward puts the marker on a
      // far wall and the gesture can never arm.
      if (source._origin === 'hand' && this.session._palmDown[source._hand]) {
        const p = castRay(o.x, o.y, o.z, 0, -1, 0);
        if (!p) return [];
        return [{
          getPose: () => ({ transform: transform(p.x, p.y, p.z, quatFromUp(p.n)) }),
          createAnchor: () => Promise.resolve(this.session._makeAnchor(p.x, p.y, p.z)),
        }];
      }
      // The stored offset ray is head-local (x right, y up, −z forward); rotate
      // it by the full head basis so the fan follows pitch as well as yaw.
      const r = source._ray || { x: 0, y: -0.35, z: -1 };
      const b = basis();
      const dx = b.r.x * r.x + b.u.x * r.y + b.f.x * -r.z;
      const dy = b.r.y * r.x + b.u.y * r.y + b.f.y * -r.z;
      const dz = b.r.z * r.x + b.u.z * r.y + b.f.z * -r.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const p = castRay(o.x, o.y, o.z, dx / len, dy / len, dz / len);
      if (!p) return [];
      return [{
        getPose: () => ({ transform: transform(p.x, p.y, p.z, quatFromUp(p.n)) }),
        createAnchor: () => Promise.resolve(this.session._makeAnchor(p.x, p.y, p.z)),
      }];
    }
    createAnchor(rigid) {
      const p = rigid && rigid.position ? rigid.position : { x: 0, y: 0, z: 0 };
      return Promise.resolve(this.session._makeAnchor(p.x, p.y, p.z));
    }
    get detectedPlanes() { return this.session._planes; }
    get detectedMeshes() { return new Set(); }
  }

  class FakeSession extends EventTarget {
    constructor(mode, opts) {
      super();
      this.mode = mode;
      this.opts = opts || {};
      this.environmentBlendMode = 'additive';
      this.visibilityState = 'visible';
      this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 100 };
      this._sources = [new FakeInputSource('left', true), new FakeInputSource('right', true)];
      this._cbs = [];
      this._raf = 0;
      this._hitTest = true;
      this._anchors = new Map();
      this._palmDown = { left: false, right: false };
      this._palmUp = { left: false, right: false };
      this._running = true;
      this._planeSpaces = new Map();
      this._planes = new Set();
      this._buildPlanes();
      this._tick = this._tick.bind(this);
      requestAnimationFrame(this._tick);
    }
    // Only present if the page asked for plane-detection, exactly like the real
    // thing — so the "no Space Setup" path is testable by leaving it out.
    _buildPlanes() {
      const want = (this.opts.optionalFeatures || []).includes('plane-detection')
                || (this.opts.requiredFeatures || []).includes('plane-detection');
      if (!want || self.__XR_MOCK_NO_PLANES__) return;
      const quad = (w, h) => [
        { x: -w / 2, y: 0, z: -h / 2 }, { x: w / 2, y: 0, z: -h / 2 },
        { x: w / 2, y: 0, z: h / 2 }, { x: -w / 2, y: 0, z: h / 2 },
      ];
      const defs = [
        { label: 'floor', x: 0, y: FLOOR_Y, z: 0, w: 4, h: 3 },
        { label: 'ceiling', x: 0, y: ROOM.ceil, z: 0, w: 4, h: 3 },
        { label: 'table', x: 0, y: TABLE_Y, z: -0.6, w: 1.2, h: 0.8 },
        { label: 'wall', x: ROOM.x0, y: 1.25, z: 0, w: 3, h: 2.5 },
        { label: 'wall', x: ROOM.x1, y: 1.25, z: 0, w: 3, h: 2.5 },
      ];
      for (const d of defs) {
        const space = new FakeSpace('plane:' + d.label);
        this._planeSpaces.set(space, d);
        this._planes.add({
          planeSpace: space, polygon: quad(d.w, d.h),
          semanticLabel: d.label, orientation: d.label === 'wall' ? 'vertical' : 'horizontal',
          lastChangedTime: 1,
        });
      }
    }
    get inputSources() { return this._sources; }
    _makeAnchor(x, y, z) {
      const space = new FakeSpace('anchor');
      this._anchors.set(space, { x, y, z });
      return { anchorSpace: space, delete: () => this._anchors.delete(space) };
    }
    _tick() {
      if (!this._running) return;
      const cbs = this._cbs; this._cbs = [];
      const frame = new FakeFrame(this);
      for (const cb of cbs) { try { cb(performance.now(), frame); } catch (e) { console.error('xr cb', e); } }
      requestAnimationFrame(this._tick);
    }
    requestAnimationFrame(cb) { this._cbs.push(cb); return ++this._raf; }
    cancelAnimationFrame() {}
    updateRenderState(s) { Object.assign(this.renderState, s); }
    async requestReferenceSpace(type) {
      if (type === 'unbounded') throw new DOMException('unsupported', 'NotSupportedError');
      const sp = new FakeSpace('ref:' + type);
      sp.getOffsetReferenceSpace = () => sp;
      sp.addEventListener = () => {};
      sp.removeEventListener = () => {};
      return sp;
    }
    async requestHitTestSource(opts) {
      const space = opts && opts.space;
      const src = this._sources.find(s => s.targetRaySpace === space);
      return {
        _origin: src ? 'hand' : 'viewer',
        _hand: src ? src.handedness : null,
        _ray: opts && opts.offsetRay ? opts.offsetRay.direction : null,
        cancel() {},
      };
    }
    async end() {
      this._running = false;
      this.dispatchEvent(new Event('end'));
      if (this.onend) this.onend(new Event('end'));
    }

    // ── test controls ───────────────────────────────────────────────────────
    pinch(which) {
      const e = new Event('selectstart');
      e.inputSource = this._sources[which]; e.frame = new FakeFrame(this);
      this.dispatchEvent(e);
    }
    release(which) {
      const e = new Event('selectend');
      e.inputSource = this._sources[which]; e.frame = new FakeFrame(this);
      this.dispatchEvent(e);
    }
    // Put both hands in the "held out in front of you" pose, or drop them.
    handsForward(on) {
      if (on) this.handsPose({ r: 0.16, u: -0.3, f: 0.45 });
      else this.handsPose({ r: 0.18, u: -0.62, f: 0.12 });
    }
    // Place both hands at an explicit head-local offset. Needed for the
    // palm-down dwell, which only arms when the hand is 2–35 cm above the
    // surface the marker is on — so the test has to put the hand there.
    // Put the RIGHT index fingertip on a world point, and drop the left hand
    // out of the way. Used to test the touch zones — reaching out and poking a
    // tap is the interaction, so the test has to actually poke it.
    handAt(p) {
      // Solve against the YAW-ONLY basis, because that is what headToWorld
      // uses to place hands. Solving with the pitched basis instead put the
      // fingertip metres off target whenever the head was looking down — so
      // reaching for the tap silently missed it, and only the shower (roughly
      // at eye level) ever registered.
      const s = Math.sin(viewer.yaw), c = Math.cos(viewer.yaw);
      // The fingertip hangs 3 cm below the wrist in the default pose.
      const dx = p.x - viewer.x, dy = (p.y + 0.03) - viewer.y, dz = p.z - viewer.z;
      handLocal.right = { r: c * dx - s * dz, u: dy, f: -(s * dx + c * dz) };
      handLocal.left = { r: -0.5, u: -0.7, f: 0.05 };
    }
    handsPose(o) {
      handLocal.left = { r: -Math.abs(o.r), u: o.u, f: o.f };
      handLocal.right = { r: Math.abs(o.r), u: o.u, f: o.f };
    }
    palmDown(on) { this._palmDown.left = this._palmDown.right = !!on; }
    // Both palms UP and held together — the cup that spawns a pet. Distinct
    // from palmDown, which faces the other way and is the placement dwell.
    palmUp(on) { this._palmUp.left = this._palmUp.right = !!on; }
    cupHands() {
      this.palmDown(false);
      this.palmUp(true);
      handLocal.left = { r: -0.07, u: -0.35, f: 0.34 };
      handLocal.right = { r: 0.07, u: -0.35, f: 0.34 };
    }
    // Move and turn the fake person. This is what makes room sense fill in.
    walk(dx, dz, dyaw) {
      viewer.x += dx || 0; viewer.z += dz || 0; viewer.yaw += dyaw || 0;
    }
    look(yaw, pitch) {
      if (yaw !== undefined && yaw !== null) viewer.yaw = yaw;
      if (pitch !== undefined && pitch !== null) viewer.pitch = pitch;
    }
    lookAround(steps) {
      for (let i = 0; i < (steps || 12); i++) viewer.yaw += Math.PI * 2 / (steps || 12);
    }
    get viewer() { return viewer; }
  }

  class FakeWebGLLayer {
    constructor() {
      this.framebuffer = null;
      this.framebufferWidth = 1024;
      this.framebufferHeight = 1024;
      this.getViewport = () => ({ x: 0, y: 0, width: 1024, height: 1024 });
    }
  }
  window.XRWebGLLayer = FakeWebGLLayer;
  window.XRRigidTransform = class { constructor(pos, ori) { this.position = pos || {x:0,y:0,z:0}; this.orientation = ori || {x:0,y:0,z:0,w:1}; } };
  // Needed by the room-sense probe fan; the real one takes (origin, direction).
  if (!window.XRRay) window.XRRay = class { constructor(o, d) { this.origin = o; this.direction = d || { x: 0, y: 0, z: -1, w: 0 }; } };

  // navigator.xr is a read-only accessor — plain assignment silently fails.
  Object.defineProperty(navigator, 'xr', {
    configurable: true, writable: true,
    value: {
      async isSessionSupported(mode) { return mode === 'immersive-ar'; },
      async requestSession(mode, opts) {
        const s = new FakeSession(mode, opts);
        window.__xrSession = s;
        return s;
      },
      addEventListener() {}, removeEventListener() {},
    },
  });
  window.__XR_MOCK__ = true;
})();
