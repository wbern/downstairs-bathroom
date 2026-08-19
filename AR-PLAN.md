# AR plan — from "stand in a circle" to "walk around a real room"

Written 2026-08-19. Applies to `3d-babylon/index.html` only; `3d/` (three.js) is
frozen and will be retired. Read `CLAUDE.md` first — the XR section there records
every Babylon built-in that was tried and reverted, and none of that changes.

## The brief

William, after wearing the thing:

1. Walk around **endlessly** — the current experience assumes you stand still in
   a small circle.
2. **No big setup phase.** The room should detect itself while you walk, with
   visual feedback that parts of it have been found.
3. The bathroom **spawns facing the wrong way** — 180° out.
4. The placement affordance should be **"hold your hands out in front of you"**,
   not an abstract halo on the floor.
5. The hand dots should be **subtler** — right now they read as skeleton hands.

## What was actually limiting us

Worth being precise, because "walking" was already half-built. `AR · full skala`
already sets scale 1, drops the room to floor level and re-runs the inside/outside
wall test against the live headset position every frame. The anchor is re-read
per frame so tracking refinement doesn't slide the model.

The real limits were:

- **No knowledge of the real room.** Hit-test points and nothing else, so the
  virtual room lands wherever you pointed and a real wall runs through it.
- **Floor height was guessed** from whatever surface the hit-test found at
  placement time (`placedY`), so 1:1 mode could sit the floor on a table.
- **Placement was a one-shot ceremony** aimed at a spot near you, which framed the
  whole thing as "put the model down *there*" rather than "you are in it".

## The design

### 1. Room sense — three tiers, no setup phase

The key decision: **do not require Space Setup.** Meta's `plane-detection` is
excellent but needs a prior room scan, which is exactly the "huge setup phase"
being rejected. So room sense is tiered, best-available, every tier optional:

| Tier | Source | Needs setup? | Gives |
|---|---|---|---|
| A | `plane-detection` → `frame.detectedPlanes` | Yes (Space Setup) | Labelled walls/floor/ceiling/tables, instantly |
| B | `mesh-detection` → `frame.detectedMeshes` | Yes | Full room mesh |
| C | Continuous hit-test accumulation | **No** | A point cloud that fills in as you walk |

Tier C is the one that satisfies the brief and it works on any device that has
`hit-test` — which we already request. Every frame we already run hit-tests from
the viewer ray and from each hand ray for the reticle; those results are now also
**pushed into a 12 cm voxel hash**. Standing still adds nothing (the voxel is
already known); walking and looking around paints the room in.

Drift over a long walk is the known failure of naive accumulation. Mitigated the
cheap way: points are stored in the same reference space the anchor lives in and
the cloud is capped and aged, rather than kept forever.

**Visual feedback** is the point, not a debug view: each newly discovered voxel
pops in as a small warm dot that fades from bright to faint over ~2 s, so
you literally see the room being learned as you sweep your gaze. Detected planes
(tier A) additionally draw as soft outlined quads. The status plate carries a
live count.

**Floor height** now comes from room sense — the `floor` semantic plane if we
have one, otherwise the 5th-percentile Y of the accumulated cloud, otherwise
`local-floor`'s y = 0. That is what makes 1:1 mode reliable without a setup step.

### 2. Endless walking

- Request `unbounded` as an **optional** feature with a `local-floor` fallback.
  Quest Browser has historically not implemented `unbounded`, so this must never
  be required; on a runtime that does support it, long walks stop accumulating
  origin error.
- Placement no longer needs a surface near you: the footprint preview falls back
  to a projected spot at the sensed floor height in front of you.
- Nothing else in the frame loop assumes proximity. The control panel already
  lazily follows you at waist height.

Honest limit: how far you can physically walk is a **Guardian** question, not a
code question. Passthrough with a large stationary boundary, or boundary off, is
what actually unlocks a whole flat.

### 3. Spawn yaw

`startPlacement` computed `yaw = atan2(cam.x - p.x, cam.z - p.z) + Math.PI`. The
`+ Math.PI` is the bug. Replaced with a named `SPAWN_YAW_OFFSET` so the next
correction is a one-line edit rather than a hunt through trigonometry.

### 4. Hands-forward placement

The halo goes. Two changes:

- **The preview is the room's own footprint**, not an abstract ring: a rectangle
  the size of the bathroom at the current scale, lying on the sensed floor, with
  corner ticks and a soft edge. You can see what you are about to place and which
  way it faces (a front notch marks the door wall), which also makes the yaw fix
  self-evidently correct on device.
- **Hold both hands out in front of you** to place. Both hands tracked, both
  ahead of your head, roughly level, 25–75 cm out → the footprint centres between
  them and a bar fills over 900 ms. Release or drop a hand to cancel.

Pinch-to-place and palm-down dwell both stay. This is an *added* path, not a
replacement — an invented gesture that is the only way in is a trap, and pinch is
the one that has been proven on device.

### 5. Subtler hands

Same 25 raw `getJointPose` spheres (Babylon's hand visuals stay banned — they
drew huge and skewed on device), but tiered: fingertips read clearly, knuckles and
metacarpals fade almost out. Three shared materials at descending alpha, per-joint
scale weights, and excluded from the glow layer. The skeleton read comes from all
25 joints being equally bright; weighting them fixes it without losing the
tracking feedback that makes pinching feel reliable.

## Testing

Everything above is unverifiable by eye on a desktop, which is how the previous
round of bugs survived to the headset. So:

- `tools/xr-mock.js` gains a **walking viewer pose**, **`detectedPlanes`**,
  hit-test results that vary with where the fake viewer is looking, and posable
  hands (`handsForward()`, `pinch()`, `walk()`).
- `3d-babylon/?xrmock=1` loads the mock before Babylon starts. Opt-in only.
- `3d-babylon/?xrtest=1` runs an assertion suite through the real code path and
  leaves the result on `window.__arTest` — scale is 0.06 in tabletop and 1.0 at
  1:1, the room is placed after a pinch, the sensed floor is picked up, the yaw
  has no 180° flip, room-sense voxels accumulate while walking.

Assert on numbers. Every AR bug in this project was found this way after being
reported from a headset in prose.

### Watching it run

`tools/ar-test.mp4` (18 s) is a recording of an actual `?xrtest=1` run — the real
AR code path, driven by the mock, with each assertion captioned as it fires. It
exists so the run can be *checked* without anyone re-running it by hand.

Live: https://pages.bernting.se/downstairs-bathroom/tools/ar-test.mp4

How it was made, so it can be redone after a change:

1. Serve locally (`python3 -m http.server`) and open `3d-babylon/?xrtest=1` with
   an initScript that (a) forces `bern_lang=sv`, (b) runs a `MediaRecorder` on
   `canvas.captureStream(30)`, (c) captures `[xrtest]` console lines with
   timestamps, and (d) stops ~1 s after `window.__arTest.done`.
2. **Stand a neutral grey in for `scene.clearColor`** while `inXR`. In AR the
   scene clears to transparent so the passthrough camera shows through; with no
   camera it encodes as pure black and the recording looks like a void.
3. Read the blob out as base64, `ffmpeg -fflags +genpts` to recover timestamps
   (MediaRecorder webm carries none), then burn the captions in from an SRT
   built off the console timestamps.

Two things in the video are **mock artefacts, not the real look**: the hands are
grids of dots because the fake hand is a rectangular joint lattice rather than an
anatomical one, and the "room" is a bare grey because there is no passthrough
feed. Everything else — footprint, room-sense dots, the fill bar, the countdown,
the status plate's live voxel count — is exactly what the headset will draw.

## Still open after this

- **Alignment to your real room** (snap the model's corner to a real corner from
  two wall normals) is deliberately *not* in this pass. It depends on tier A
  planes, which depend on Space Setup — the thing we're avoiding. Revisit once
  room sense has been worn.
- **Occlusion.** Cheapest useful version: render detected planes depth-only so
  real walls hide virtual geometry. Full `depth-sensing` is a bigger job with a
  known class of flicker/FOV bugs; not now.
- Still per-headset, still no iOS.
