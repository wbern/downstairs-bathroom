// A calm, scripted walk through the 1:1 AR experience — for recording, and for
// watching the full-scale path behave without a headset.
//
// Not shipped. Load it alongside tools/xr-mock.js on 3d-babylon/?xrmock=1 and
// call `__arWalk()`. It drives the SAME code the headset runs; nothing here
// reaches into the viewer except the four buttons a user can press.
//
// The assertion suite (?xrtest=1) jumps between states as fast as it can, which
// is right for a test and unwatchable as a demonstration. This moves at human
// speed and answers one question: if I put the headset on, walk around, and
// place the bathroom at full size — can I walk into it?
(function () {
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Captions are emitted to the console with timestamps so a recording can burn
  // them in afterwards, the same way the test suite's PASS lines are.
  let t0 = 0;
  const say = msg => console.log(`[arwalk] ${((performance.now() - t0) / 1000).toFixed(2)} ${msg}`);

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Where the placed room's footprint actually is, in world metres. Everything
  // about walking into it is derived from this rather than assumed, because the
  // assumption is exactly what went wrong last time.
  function roomCentre(V) {
    const V3 = window.BABYLON.Vector3;
    const M = V.scene.getTransformNodeByName('root').computeWorldMatrix(true);
    const b = V.box;
    let x = 0, z = 0, n = 0;
    for (const sx of [b.min.x, b.max.x])
      for (const sz of [b.min.z, b.max.z]) {
        const p = V3.TransformCoordinates(new V3(sx, b.min.y, sz), M);
        x += p.x; z += p.z; n++;
      }
    return { x: x / n, z: z / n };
  }

  // Move the fake person smoothly from wherever they are to a target pose.
  // Snapping the viewer around is what made the first recording unwatchable —
  // and it isn't how a headset moves either.
  function glide(v, to, ms) {
    return new Promise(res => {
      const from = { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch };
      const start = performance.now();
      const step = () => {
        const u = Math.min(1, (performance.now() - start) / ms);
        const e = ease(u);
        v.x = lerp(from.x, to.x !== undefined ? to.x : from.x, e);
        v.z = lerp(from.z, to.z !== undefined ? to.z : from.z, e);
        v.yaw = lerp(from.yaw, to.yaw !== undefined ? to.yaw : from.yaw, e);
        v.pitch = lerp(from.pitch, to.pitch !== undefined ? to.pitch : from.pitch, e);
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  window.__arWalk = async function () {
    t0 = performance.now();
    const V = window.viewer;
    const AR = V.ar;
    say('entering AR at full scale');
    await AR.enterAR('skala');
    await wait(600);
    const s = window.__xrSession;
    // Draw the simulator's room. On a headset this is passthrough video; here
    // it is the only way to see that the detection lands on actual surfaces.
    if (window.__buildMockRoom) {
      window.__buildMockRoom(window.BABYLON, V.scene);
      window.__showMockRoom(true, V.scene);
    }
    const v = s.viewer;
    // Stand at one end of the long axis, facing down it (−X). The fake room is
    // 4 × 3 m, so this is the only direction with room to place the bathroom
    // ahead of you AND walk into it. The first version faced +Z from 15 cm off
    // the near wall: the floor aim projected the room 4.3 m away, straight
    // through the wall behind, and the walk then went the other way entirely.
    v.x = 1.7; v.z = 0.2; v.yaw = Math.PI / 2; v.pitch = -0.1;
    const FACING = Math.PI / 2;

    say('the grey room is the SIMULATOR standing in for passthrough video');
    await wait(2400);

    // 1 — look around. The room learns itself while you do; nothing is asked
    //     of you and there is no scanning mode to sit through.
    say('looking around — the room detects itself, no setup step');
    await glide(v, { yaw: FACING - 1.0, pitch: -0.35 }, 2600);
    await glide(v, { yaw: FACING + 1.0, pitch: -0.2 }, 3200);
    say('dots land on the real surfaces; shaded panels are recognised planes');
    await glide(v, { yaw: FACING, pitch: -0.45 }, 2400);

    // 2 — take a couple of steps. Walking is what fills room sense in.
    say('taking a few steps — walking is what fills it in');
    await glide(v, { x: 1.4, z: -0.6, yaw: FACING + 0.5, pitch: -0.4 }, 3000);
    await glide(v, { x: 1.7, z: 0.4, yaw: FACING - 0.4, pitch: -0.45 }, 3200);

    // 3 — aim at the floor. The preview is the bathroom's own footprint.
    say('aiming at the floor — the preview is the real footprint, at real size');
    await glide(v, { x: 1.7, z: 0.1, yaw: FACING, pitch: -0.6 }, 2200);
    await wait(1400);

    // 4 — place it: hands out in front, bar fills, 3-2-1, the room grows in.
    say('holding both hands out in front to place it');
    s.handsForward(true);
    await wait(1500);
    s.handsForward(false);
    say('3 — 2 — 1');
    await wait(2600);
    say('placed at 1:1 — walls start see-through so you can see where you walk');
    await wait(1600);

    // 5 — walk to where the room ACTUALLY IS. Measured, not assumed: the
    //     previous version walked a hard-coded direction, the placement rule
    //     changed underneath it, and the recording ended up captioned
    //     "standing inside the bathroom" over footage shot from outside it.
    const where = roomCentre(V);
    await glide(v, { pitch: -0.05 }, 1400);
    await wait(1000);
    say('walking into it');
    await glide(v, { x: where.x + 1.5, z: where.z, pitch: 0.0 }, 3600);
    // Stop just inside the doorway rather than dead centre. The clear floor is
    // 2.28 × 1.13 m — standing in the middle of it and turning puts your nose
    // in the wall cabinet, which is honest about the size but shows nothing.
    await glide(v, { x: where.x + 0.45, z: where.z }, 3200);

    // 6 — inside, at real size. Claimed only if the viewer agrees.
    const st6 = AR.state();
    say(st6.inside ? 'standing inside the bathroom, at real size'
                   : 'NOT inside — placement and walk disagree');
    await glide(v, { yaw: FACING - 0.85, pitch: -0.12 }, 3200);
    await glide(v, { yaw: FACING + 0.95, pitch: 0.1 }, 4200);
    await glide(v, { yaw: FACING, pitch: -0.1 }, 2400);

    say('walls solid — what it looks like finished');
    AR.arToggleWalls();
    await wait(1200);
    await glide(v, { yaw: FACING - 0.9, pitch: -0.05 }, 3000);
    await glide(v, { yaw: FACING + 0.6 }, 2600);

    // 7 — the measurement, taken on screen rather than claimed. Edge lengths in
    //     world metres, not an axis-aligned box (which grows with the yaw).
    const st = AR.state();
    const V3 = window.BABYLON.Vector3;
    const root = V.scene.getTransformNodeByName('root');
    const M = root.computeWorldMatrix(true);
    const P = (x, y, z) => V3.TransformCoordinates(new V3(x, y, z), M);
    const b = V.box;
    const o = P(b.min.x, b.min.y, b.min.z);
    const w = V3.Distance(o, P(b.max.x, b.min.y, b.min.z));
    const h = V3.Distance(o, P(b.min.x, b.max.y, b.min.z));
    const d = V3.Distance(o, P(b.min.x, b.min.y, b.max.z));
    window.__arWalkSize = `${w.toFixed(2)} × ${d.toFixed(2)} m, ${h.toFixed(2)} m to the ceiling`;
    say(`measured where it stands: ${window.__arWalkSize}`);
    await wait(2600);
    say('walking back out');
    await glide(v, { x: where.x + 2.2, z: where.z, yaw: FACING, pitch: -0.05 }, 3600);
    await wait(1000);
    // Recorded so the caption can be checked against the code, not just watched.
    window.__arWalkDone = {
      placed: st.arPlaced, mode: st.arMode, scale: st.grab,
      wasInside: st6.inside, size: window.__arWalkSize, centre: where,
    };
    say('done');
    return window.__arWalkDone;
  };
})();
