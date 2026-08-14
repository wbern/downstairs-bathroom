// Fake WebXR runtime for testing the AR flow in a normal browser.
//
// Not shipped — a test harness. Injected before the viewer loads (via the
// chrome-devtools MCP's initScript) so `navigator.xr` looks like a headset:
// an immersive-ar session with a render loop, a hit-test source that reports a
// table surface, and two "hands" whose pinches fire selectstart/selectend.
//
// This exists because every AR bug so far has been found by a human wearing a
// Quest and reported in prose. Driving the real code path in a browser turns
// "spawns huge" into an assertion on a number.
(function () {
  const FLOOR_Y = 0;
  const TABLE_Y = 0.75;

  const ident = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  function transform(x, y, z) {
    const m = ident(); m[12] = x; m[13] = y; m[14] = z;
    return {
      matrix: m,
      position: { x, y, z, w: 1 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      inverse: { matrix: (() => { const i = ident(); i[12] = -x; i[13] = -y; i[14] = -z; return i; })() },
    };
  }

  class FakeSpace {}

  class FakeInputSource {
    constructor(handedness, hasHand) {
      this.handedness = handedness;
      this.targetRayMode = 'tracked-pointer';
      this.targetRaySpace = new FakeSpace();
      this.gripSpace = new FakeSpace();
      this.profiles = [];
      this.pos = { x: handedness === 'left' ? -0.15 : 0.15, y: TABLE_Y + 0.12, z: -0.45 };
      if (hasHand) {
        // 25 joints, keyed like the real XRHand map.
        const names = ['wrist',
          'thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
          'index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip',
          'middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip',
          'ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip',
          'pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
        const map = new Map();
        for (const n of names) map.set(n, new FakeSpace());
        this.hand = map;
        this.hand.get = map.get.bind(map);
      }
    }
  }

  class FakeFrame {
    constructor(session) { this.session = session; }
    getViewerPose(ref) {
      const t = transform(0, 1.6, 0);
      return { transform: t, views: [{
        eye: 'none', transform: t,
        projectionMatrix: new Float32Array([1.3,0,0,0, 0,1.7,0,0, 0,0,-1,-1, 0,0,-0.02,0]),
      }] };
    }
    getPose(space, ref) {
      const src = this.session._sources.find(s => s.targetRaySpace === space || s.gripSpace === space);
      if (src) return { transform: transform(src.pos.x, src.pos.y, src.pos.z) };
      if (this.session._anchors.has(space)) {
        const a = this.session._anchors.get(space);
        return { transform: transform(a.x, a.y, a.z) };
      }
      return { transform: transform(0, 0, 0) };
    }
    getJointPose(space, ref) {
      for (const src of this.session._sources) {
        if (!src.hand) continue;
        for (const [name, sp] of src.hand) {
          if (sp !== space) continue;
          // A crude but well-formed hand: joints spread around the source pos.
          const i = [...src.hand.keys()].indexOf(name);
          return {
            transform: transform(src.pos.x + (i % 5) * 0.012,
                                 src.pos.y + Math.floor(i / 5) * 0.008,
                                 src.pos.z - (i % 7) * 0.01),
            radius: 0.008,
          };
        }
      }
      return null;
    }
    getHitTestResults(source) {
      if (!this.session._hitTest) return [];
      const y = this.session._surfaceY;
      return [{
        getPose: () => ({ transform: transform(0.05, y, -0.5) }),
        createAnchor: () => Promise.resolve(this.session._makeAnchor(0.05, y, -0.5)),
      }];
    }
    createAnchor(rigid, ref) {
      const p = rigid && rigid.position ? rigid.position : { x: 0, y: 0, z: 0 };
      return Promise.resolve(this.session._makeAnchor(p.x, p.y, p.z));
    }
  }

  class FakeSession extends EventTarget {
    constructor(mode, opts) {
      super();
      this.mode = mode;
      this.environmentBlendMode = 'additive';
      this.visibilityState = 'visible';
      this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 100 };
      this._sources = [new FakeInputSource('left', true), new FakeInputSource('right', true)];
      this._cbs = [];
      this._raf = 0;
      this._hitTest = true;
      this._surfaceY = TABLE_Y;
      this._anchors = new Map();
      this._anchorSeq = 0;
      this._running = true;
      this._tick = this._tick.bind(this);
      requestAnimationFrame(this._tick);
    }
    get inputSources() { return this._sources; }
    _makeAnchor(x, y, z) {
      const space = new FakeSpace();
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
    async requestReferenceSpace() {
      const sp = new FakeSpace();
      sp.getOffsetReferenceSpace = () => sp;
      sp.addEventListener = () => {};
      sp.removeEventListener = () => {};
      return sp;
    }
    async requestHitTestSource() { return { cancel() {} }; }
    async end() {
      this._running = false;
      this.dispatchEvent(new Event('end'));
      if (this.onend) this.onend(new Event('end'));
    }
    // Test controls
    pinch(which) {
      const src = this._sources[which];
      const e = new Event('selectstart'); e.inputSource = src; e.frame = new FakeFrame(this);
      this.dispatchEvent(e);
    }
    release(which) {
      const src = this._sources[which];
      const e = new Event('selectend'); e.inputSource = src; e.frame = new FakeFrame(this);
      this.dispatchEvent(e);
    }
    moveHand(which, dx, dy, dz) {
      const p = this._sources[which].pos;
      p.x += dx; p.y += dy; p.z += dz;
    }
  }

  class FakeWebGLLayer {
    constructor(session, gl) {
      this.framebuffer = null;
      this.framebufferWidth = 1024;
      this.framebufferHeight = 1024;
      this.getViewport = () => ({ x: 0, y: 0, width: 1024, height: 1024 });
    }
  }
  window.XRWebGLLayer = FakeWebGLLayer;
  window.XRRigidTransform = class { constructor(pos, ori) { this.position = pos || {x:0,y:0,z:0}; this.orientation = ori || {x:0,y:0,z:0,w:1}; } };

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
