// Draws the fake room that tools/xr-mock.js ray-marches, so you can SEE what
// room sense is detecting.
//
// Not shipped, and not part of the app. On a headset the real room arrives as
// passthrough video from the cameras; there is no passthrough in a browser, so
// without this the simulator's walls are invisible geometry and the detection
// dots look like they are floating in a void — which is exactly what they
// looked like in the first walkthrough recording, and exactly why it read as
// "nothing is being recognised".
//
// The dimensions here MUST match the ROOM/TABLE constants in xr-mock.js, or the
// detection would land somewhere other than the drawn surfaces and the whole
// point is lost.
(function () {
  const ROOM = { x0: -2, x1: 2, z0: -1.5, z1: 1.5, ceil: 2.5 };
  const TABLE = { y: 0.75, hx: 0.6, cz: -0.6, hz: 0.4 };

  window.__buildMockRoom = function (B, scene) {
    if (window.__mockRoom) return window.__mockRoom;
    const g = new B.TransformNode('mockRoom', scene);

    // Passthrough is a BACKDROP, not geometry: the headset composites camera
    // video behind everything and virtual content draws on top regardless of
    // depth. Modelling that matters twice over — a solid fake wall 30 cm from
    // your face otherwise hides the control panel (which never happens on
    // device), and the detected-plane fills sit in exactly the same place as
    // the fake walls and z-fight with them.
    //
    // Babylon clears the depth buffer between rendering groups, so putting the
    // room in group 0 and everything else in group 1 reproduces passthrough
    // compositing exactly. New meshes keep arriving (sense dots, hand joints,
    // UI plates), so the hook has to stay live.
    const promote = m => { if (m.name.slice(0, 2) !== 'mk') m.renderingGroupId = 1; };
    for (const m of scene.meshes) promote(m);
    scene.onNewMeshAddedObservable.add(promote);

    // A dim, matte, slightly cool grey — deliberately duller than anything the
    // bathroom is made of, so the model always reads as the virtual object and
    // this reads as "the room you happen to be standing in".
    // A 0.5 m grid, drawn once and tiled. A flat matte surface gives the eye
    // nothing: the first version rendered wall, floor and ceiling as one
    // uniform brown field, so you could not tell them apart, could not tell you
    // were moving, and could not see that the detection dots were landing on
    // anything. The grid is what makes it read as a room.
    // One 0.5 m tile, drawn per tint. The colour is BAKED INTO the canvas rather
    // than left to emissiveColor: Babylon does not reliably modulate an emissive
    // texture by emissiveColor, and the first attempt came out blown-out white
    // whatever tint it was given. Note also that a DynamicTexture does not
    // survive .clone() — the copy has no canvas and never turns ready, which
    // renders the whole room invisible with no error anywhere.
    const tileURL = hex => {
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const c = cv.getContext('2d');
      c.fillStyle = hex;
      c.fillRect(0, 0, S, S);
      // Barely there. The grid exists so you can tell wall from floor and see
      // that you are moving — not so it can dominate the frame. At 0.26 it read
      // as graph paper and drowned the bathroom, which is the thing the
      // recording is actually about.
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 2;
      c.strokeRect(1, 1, S - 2, S - 2);
      return cv.toDataURL();
    };

    // UNLIT. This stands in for passthrough video, which is camera footage, not
    // something the bathroom's own spotlights illuminate. It is also the only
    // way it shows up at all: in AR the scene lighting is tuned for the model,
    // and a lit stand-in came out pure black.
    const mat = (hex, u, v) => {
      const m = new B.StandardMaterial('mockRoomMat', scene);
      m.diffuseColor = B.Color3.Black();
      m.specularColor = B.Color3.Black();
      // BLACK, with all the colour baked into the tile. StandardMaterial ADDS
      // emissiveColor to emissiveTexture rather than modulating by it, so a
      // white emissiveColor blew the room out to flat grey no matter how dark
      // the tile was — which is why darkening the tints twice changed nothing.
      m.emissiveColor = B.Color3.Black();
      const t = new B.Texture(tileURL(hex), scene);
      t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
      t.uScale = u; t.vScale = v;
      m.emissiveTexture = t;
      m.disableLighting = true;
      m.backFaceCulling = false;
      return m;
    };
    // These look far too dark as hex values, and that is correct: the viewer
    // tone-maps and exposes the frame, so a #6a6155 wall came out a flat #c8c8c8.
    // They are chosen for how they LAND, not how they read in the source.
    // 1 m tiles, not 0.5 — half as many lines. And the tones sit close together
    // so the stand-in room recedes behind the model instead of competing with it.
    const RW = ROOM.x1 - ROOM.x0, RD = ROOM.z1 - ROOM.z0, T = 1.0;
    const floorMat = mat('#454039', RW / T, RD / T);
    const ceilMat = mat('#2e2b27', RW / T, RD / T);
    const wallMatX = mat('#524a40', RD / T, ROOM.ceil / T);   // walls facing along X
    const wallMatZ = mat('#4a433a', RW / T, ROOM.ceil / T);   // walls facing along Z
    const tableMat = mat('#63563f', 1, 1);

    const w = ROOM.x1 - ROOM.x0, d = ROOM.z1 - ROOM.z0;
    const cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2;

    const add = (mesh, material) => {
      mesh.material = material;
      mesh.isPickable = false;
      // Keep them out of the mirror probe's render list, like the hand dots and
      // the reticle — the bathroom mirror should reflect the bathroom.
      mesh.userData = { arOnly: true };
      mesh.parent = g;
      return mesh;
    };

    const floor = add(B.MeshBuilder.CreateGround('mkFloor', { width: w, height: d }, scene), floorMat);
    floor.position.set(cx, 0, cz);

    const ceil = add(B.MeshBuilder.CreateGround('mkCeil', { width: w, height: d }, scene), ceilMat);
    ceil.position.set(cx, ROOM.ceil, cz);

    for (const [x, z, ww, rot, wm] of [
      [cx, ROOM.z0, w, 0, wallMatZ], [cx, ROOM.z1, w, Math.PI, wallMatZ],
      [ROOM.x0, cz, d, Math.PI / 2, wallMatX], [ROOM.x1, cz, d, -Math.PI / 2, wallMatX],
    ]) {
      const wall = add(B.MeshBuilder.CreatePlane('mkWall', { width: ww, height: ROOM.ceil }, scene), wm);
      wall.position.set(x, ROOM.ceil / 2, z);
      wall.rotation.y = rot;
    }

    const table = add(B.MeshBuilder.CreateBox('mkTable', {
      width: TABLE.hx * 2, depth: TABLE.hz * 2, height: 0.04,
    }, scene), tableMat);
    table.position.set(0, TABLE.y - 0.02, TABLE.cz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = add(B.MeshBuilder.CreateBox('mkLeg', { width: 0.05, depth: 0.05, height: TABLE.y - 0.04 }, scene), tableMat);
      leg.position.set(sx * (TABLE.hx - 0.06), (TABLE.y - 0.04) / 2, TABLE.cz + sz * (TABLE.hz - 0.06));
    }

    g.setEnabled(false);
    window.__mockRoom = g;
    return g;
  };

  // The AR mood adds a GlowLayer, and anything emissive that isn't excluded
  // from it blooms. Left in, the room bleached to flat white — the same failure
  // that once turned the control plates into featureless white slabs. The layer
  // is created when the session starts, which may be after the room is built,
  // so this is re-applied every time the room is shown.
  function excludeFromGlow(scene) {
    const g = window.__mockRoom;
    if (!g || !scene) return;
    for (const layer of scene.effectLayers || []) {
      if (!layer.addExcludedMesh) continue;
      for (const m of g.getChildMeshes()) layer.addExcludedMesh(m);
    }
  }

  // Show it only while an AR session is running — outside one the desktop
  // viewer should look exactly like it always does.
  window.__showMockRoom = function (on, scene) {
    const g = window.__mockRoom;
    if (!g) return;
    g.setEnabled(on);
    for (const m of g.getChildMeshes()) m.setEnabled(on);
    if (on) excludeFromGlow(scene || (g.getScene && g.getScene()));
  };
})();
