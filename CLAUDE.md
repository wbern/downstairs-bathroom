# Downstairs Bathroom — project notes

Single-page material dossier for the Bernting downstairs-bathroom renovation. It's a
static site (`index.html`) plus supporting assets, published via GitHub Pages and shared
with Ruiying. No build step, no framework — one HTML file with inline CSS + JS.

## Parties & design
- **Architect:** Studio Streck (design by Martin Häger, skiss dated 2026-04-14). Drawing: `design/BERNTING_BADRUM_LAYOUT_SKISS_260414.pdf`.
- **Carpenter / VVS:** Zäta / Z Bygg. They asked us to buy materials ourselves.
- **Buying:** as of 2026-08-10 the vanity, WC package, bottenventil and överfyllnadsring come from **Golvpoolen** (Ruiying's cart). Blandare/dusch from Westerbergs, spegel Spegelshoppen, handdukstork StudioNord, duschränna Bernstein.
- **Design intent:** microcement (warm beige) walls+floor, matt-black fixtures, oak vanity, wall-hung WC, rain shower + glass wall, round LED mirror, custom LED wall cabinet, linear tileable floor drain, 5 spotlights. All pipe runs concealed.

## Deploy
- Repo: `wbern/downstairs-bathroom` (public — required for free Pages; not indexed unless linked).
- **Live URL:** https://pages.bernting.se/downstairs-bathroom/ (custom Pages domain on the account; HTTPS enforced).
- Workflow: commit → `git push origin main` → Pages rebuilds (~1 min). Check build:
  `gh api /repos/wbern/downstairs-bathroom/pages/builds/latest -q .status` (wait for `built`).
- Commit author is set per-commit (`git -c user.name="wbern" -c user.email="kenneth.bernting@me.com"`); end messages with the Claude co-author trailer.

## Privacy
- `reference/current-state-panorama.jpg` (mirror selfie showing a person) is **git-ignored and never published**. Keep it that way. Everything else (drawing, product photos, spec PDFs, budget) is impersonal.
- `private/` is git-ignored too: the architect's original email (`Badrum - Skiss.eml`, has phone numbers + home address), an old Feb-2026 design study, and a Signal photo of the current bathroom. Working material only — **don't move anything out of `private/` into the published tree without reading it first.**

## 3D viewer (`3d/`)
Standalone page at `/downstairs-bathroom/3d/`, linked from the hero figcaption. Built from the **IFC** Martin sent on 2026-07-27 (`design/…260414.ifc`, Archicad 27 / IFC2X3) — same drawing as the PDF hero, but with real 3D geometry.

- `tools/ifc_to_json.py` → `3d/bathroom.json`. Self-contained STEP parser, no dependencies:
  faceted breps, shell-based surface models, mapped items, local-placement chains,
  styled items, ear-clip triangulation with hole bridging. mm → m; IFC Z-up → Y-up in the viewer.
  Re-run: `python3 tools/ifc_to_json.py design/BERNTING_BADRUM_LAYOUT_SKISS_260414.ifc 3d/bathroom.json`
  It prints the full surface-style table and per-object material assignment — the fastest way to see what the drawing specifies.
- `3d/vendor/` — Three.js r169 vendored (no build step, works offline, matches the site's no-framework rule). 1.3 MB raw, ~300 KB gzipped by Pages. Also vendored **unmodified** from r169: `XRHandModelFactory` + `XRHandPrimitiveModel` + `XRHandMeshModel`, and `GLTFLoader` + `BufferGeometryUtils` (which the mesh model imports). Their relative imports were rewritten to `./` because vendor/ is flat — that's the only change. Fetch replacements from `cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/...` and re-apply that rewrite.
- Shares `bern_lang` localStorage with the dossier so language carries across both pages. `bern_style` is still written for compatibility but only ever holds `black` now.
- **Materials are procedurally generated** (`makeTexSet()`): microcement, oiled oak, brushed metal and porcelain colour/roughness/bump maps are drawn on a canvas at load from seeded value noise — no texture files, works offline, no build step. UVs come from `addBoxUV()`, which projects each vertex along its normal's dominant axis in metres, so a style's `scale` reads literally as "one tile per N metres".
- **The room has no windows**, so there is no sun to model. It is lit entirely by its own fittings (`addRoomLight`): five ceiling spots with visible recessed trims, spaced down the **long** axis off the clear-floor box (only the middle one casts shadows — the rest are far too expensive; and note the outer bounding box includes wall thickness, so spacing against it buries the end fittings inside the walls), a mirror ring, LED under the vanity and in the wall cabinet, and a shower-niche glow. `applyLighting()` owns `scene.environmentIntensity`, so `applyPalette()` calls it rather than setting the value itself.
  - **Dag / Kväll is daylight *in the corridor*, not in the room** — the `hall` spotlight sits outside the doorway. **Dörr öppen / stängd** swings the leaf and gates that spill (a closed door still leaks ~7 %). The mood buttons are presets on the exposure slider, not a separate control.
  - The door leaf is re-parented to `doorPivot` at its hinge edge (geometry is absolute, so each mesh position is offset back by the hinge). The swing direction is derived so the free end travels *away* from the room centre, matching the drawing's outward-opening door.
  - The mirror lamp lives on **layer 1** and every mesh *except* the mirror is enabled on that layer. Parked in front of the glass on the default layer it throws a specular across the whole disc and the mirror renders as a white blob — this is the fix, don't "simplify" it away.
  - The mirror itself gets a **real reflection** from a `CubeCamera` (`renderMirror()`), re-rendered only when something changes (`invalidateMirror()`). Reflecting the generic studio environment instead just gives a flat white disc.
  - The IFC has no ceiling slab, so one is added and shown **only when the camera is inside** the room — otherwise it would cover the doll's-house view.
  - **There is deliberately no invisible fill light indoors.** Everything you see from inside comes from a fitting that is actually specified. `key`/`fill` exist only so the doll's-house view has an exterior to read, and the ceiling shuts them out the moment you step in. Don't add an ambient "to brighten things up" — raise the exposure slider instead.
- **`CAT_FINISH`** re-separates products the IFC flattens into one colour per surface style: glazed porcelain for WC/basin, matt powder coat for the towel rail, satin lacquer on the oak, a see-through door (opacity .3). Only applied for the **Svart** palette — Ritning and CAD stay literal. Keep metalness low on black fittings: high values mirror the environment map and matt black comes out looking like stainless.
- **Only the Svart palette remains.** Ritning and CAD were diagnostic views of the IFC's raw colours; once the materials were modelled properly they only added noise, so the whole Material switcher is gone. `PALETTES` is kept as the seam.
- **`DECOR`** gives each of the five decorative objects its own colour/finish, keyed off its IFC id. Note `cementColorFor()` is gated on **category as well as style**: the light-grey style is shared between the wall colour and the vases, so without that gate picking a cement colour repaints the decor too.
- **`CEMENTS` + `setCement()`** switch the wall/floor microcement colour live. **All seven are Jotun colour codes**, verified 2026-08-10 against Jotun's published `hexCode` values where they expose them (1276 Soft `dcd1ba`, 1875 Sans `e6dfce`, 5504 Coastal Blue `6d7d83`, 8493 Green Tea `a09b7c`, 20217 Muted Coral `bb7d69`); 1359 Macchiato and 1519 Vanilj are derived from their NCS notations. Don't eyeball these — the first pass did, and green and blue were badly off.
- **"Macchiato" is Jotun LADY 1359, not a Konkral colour.** Konkral Smooth ships uncoloured and is tinted to any NCS or Jotun code; Konkral's own sample names are Mineral, Sand, Dream, Balance, Night and Sense. The dossier said "Konkral Smooth · Macchiato" as though it were a Konkral name — corrected, and the colour section now carries a flag explaining that an order has to quote the code.
- **`TOWEL_OPTIONS` + `setTowel()`** show three places a hand towel can hang by the basin, because the obvious one doesn't exist: the clear bay between the shower glass and the WC pier is 711 mm and the chosen 610 mm vanity leaves ~50 mm each side. Options are the WC pier's free 205 mm (no layout change), the vanity's side gable (needs `setVanityShift(0.08)` — vanity, basin, mixer and mirror move together, and so do the mirror lamp and cube camera), and a bar under the basin overhang. **Watch the sign of z when placing these:** the WC pier's room-facing surface is z = −0.436 and the vanity front is z = −0.211, with the room at *greater* z — the first attempt put both fittings inside the wall.
- **AR (replaced VR):** two `immersive-ar` modes, feature-detected into the top bar. **AR · på bordet** places the room as a ~1:17 scale model on a surface; **AR · full skala** places it 1:1 on the floor so you can walk in. Both use `hit-test` + a reticle: tap once to place. Afterwards, holding *both* pointers drives a two-handed pinch — `selectstart`/`selectend` fire for hand pinches and controller triggers alike, so one code path covers both. The transform is composed as `T(mid)·Ry(Δang)·S(Δscale)·T(−mid₀)·startMatrix` and decomposed onto `world`.
  - **`world` is the AR handle**: it holds `root` *and* every room light (spots and their targets, mirror lamp, LED strips, niche, hall). Only `key`/`fill`/`ambient` stay outside it. Adding a light with `scene.add` instead of `world.add` will leave it behind when the model is placed or scaled.
  - **Placement follows the documented loop**: ray → hit-test a real surface → reticle preview → pinch to commit → anchor. The ray prefers a **hand/controller** `targetRaySpace` hit-test source over the viewer ray, so you point at the spot rather than aiming the whole headset; `watchInputSources()` keeps one source per tracked input and falls back to the head ray.
  - **Hands are drawn** with three's own `XRHandModelFactory` on the `'spheres'` profile — 25 joint primitives, generated, no runtime glTF fetch. The `'mesh'` profile pulls Oculus hand assets from a CDN, which breaks the offline rule and can fail mid-demo. Controllers get a simple ray line.
  - **The contact shadow is a painted blob**, not a real shadow: in AR the room's own lights are *inside* the model, so nothing can cast onto the table. A radial-gradient plane under the room is what makes it read as resting on the surface rather than hovering. Off outside AR.
  - **Palm-down dwell** (`updatePalmGesture`) is the alternative: hold a flat hand, palm down, 2–35 cm over the surface and a ring closes over ~900 ms, then places the model under your hand. It must be palm-**down**: Meta reserves palm-toward-you + pinch for the system menu, and on Quest the left-hand version *exits the WebXR session*. The filling ring is not decoration — an invented gesture needs a visible, cancellable progress affordance or it is undiscoverable, which is why Meta itself retreated from gesture sequences to wrist buttons.
  - **The model is bound to an `XRAnchor`, not to a pose set once.** A one-shot transform visibly slides as the headset refines its tracking — the anchor is re-reported every frame in corrected coordinates, which is what makes it feel stuck to the table. `world = anchorPose · anchorOffset` each frame, where `anchorOffset` carries everything the user's pinch has done; gestures write back into that offset or the next anchor update snaps the model home.
  - Where the runtime supports it, `requestPersistentHandle()` saves the spot under `bern_ar_anchor` in localStorage (uuid + mode + offset) and `restorePersistentAnchor()` puts it back on the next session. "Placera om" deletes it. All of this degrades quietly: no anchors → a static pose, which still works, just drifts.
  - **Persistence is per headset.** WebXR has no shared/cloud anchors, so two different devices cannot agree on the same physical spot. That needs a native app or something like 8th Wall.
  - Full-scale mode starts walls at **45 % transparent** on purpose — at 1:1 an opaque room hides the passthrough view of where you're actually standing. The Väggar button toggles it.
  - `updateWalls()` converts the camera into `world` local space before the inside/outside test, otherwise a placed or scaled model compares scene-space against model-space bounds.
  - AR needs `WebGLRenderer({alpha: true})` and `scene.background = null` during the session, or the passthrough is painted over.
  - `#arOverlay[hidden]{display:none}` is load-bearing: the overlay's own `display:flex` otherwise defeats the `hidden` attribute and it shows on desktop.
  - Plain **VR is kept only as a fallback** for headsets that report `immersive-vr` but not `immersive-ar`.
  - **Untested on a real device.** Needs a headset pass over HTTPS. Note iOS Safari on iPhone/iPad does not do WebXR — that would need a USDZ + Quick Look export.
- **Embedded mode:** `3d/?embed=1` is what the dossier's "Rummet i 3D" accordion loads in an iframe. The top bar shrinks to a right-aligned pill and the panel toggle is **moved into that bar** (collapsing hides the whole panel in embed mode, so a button inside it would vanish with it). Links retarget to `_top`; the panel starts collapsed.
- **Panel layout:** microcement → lighting (moods + exposure + door) → view → navigation, then a folded `details.adv` holding the layer toggles and wall transparency. The wall-height slider was removed as noise.
- **Godot was evaluated and rejected** for the VR path: Godot 4's web export needs cross-origin isolation (COOP/COEP response headers) for its threaded WASM build, and GitHub Pages cannot send custom headers — so the export can't run at our published URL at all. Its WebXR support also has a history of black-screen regressions on the Quest browser. Three.js + WebXR keeps the no-build-step rule and works in the headset's own browser.

### What the IFC actually specifies (read from `IFCSTYLEDITEM` surface styles)
| Style | Colour | Applied to |
|---|---|---|
| `_Microcement` | `#b1b1b1` | walls, floor |
| `_TRÄ_EK_OLJAD_X` | `#938e7f` oiled oak | vanity, wall cabinet |
| `_METALL_ROSTFRITT` | `#d3d5d8` stainless | shower, mixer, towel warmer, handles |
| `_KULÖR_VIT` / `Färg-01` | white | door, WC |
| `Yta-Porslin` / `_SPEGELGLAS` / `_GLAS` | — | basins / mirror / shower screen (73 % transp.) |
| `_KULÖR_SVART` `#181818`, `_KULÖR_LJUSGRÅ` `#cecbc8` | — | the five vases |

Palettes are keyed by those style names, so overrides stay anchored to the drawing. **Svart** is the built design — black fittings, oiled oak, and microcement in Konkral Smooth *Macchiato* (`#c2b49c`), all with generated PBR maps; **Ritning** renders the IFC colours verbatim (no maps); **CAD** is schematic. The Matt-silver palette was removed with the dossier's silver theme.

### Model quirks worth knowing
- Joinery exports as anonymous `" Tom NNN"` slabs, so the viewer splits by height: 0.34–0.84 m = vanity (466×385×500 mm), 1.15–2.13 m = wall cabinet (736×160×980 mm). **Inferred from geometry, not stated in the file.**
- Walls #409/#414 are `_GLAS` — the shower screen, not solid walls; own *Duschvägg* group.
- Wall #462 is `_OSYNLIGT` (transparency 1.0) and is dropped → 45 objects, not 46.
- Room dims shown are the **clear floor** (largest floor slab, 2.28 × 1.13 m = 2.58 m²), not the outer bounding box (2.48 × 1.39 m). The header meta on the dossier says `≈ 2280 × 2130 mm`, which is width × ceiling height — different axes, both correct, easy to confuse.
- The `GOLV / VINYL / ALTRO STRONGHOLD RUSSET` string on floor slabs is a stale template description; the real surface style is `_Microcement`. Ignore it.
- Enclosed room + outside-only lighting = black interior in *Gå in*, so there's a non-shadow-casting `PointLight` under the ceiling.

## 3D viewer, Babylon rebuild (`3d-babylon/`)
A full port of `3d/` to **Babylon.js 9.21.1**, built 2026-08-14 because Babylon has
first-class primitives for the XR interaction layer that was hand-rolled in three
(`SixDofDragBehavior` + `MultiPointerScaleBehavior`, `WebXRAnchorSystem`, hand
tracking, pointer-selection lasers, near interaction). **The dossier now points at `3d-babylon/`** (both the embedded iframe and the
"open in a new tab" link, switched 2026-08-20). `3d/` is retired in place. Everything above about the model, materials data, lighting
design, towel study and panel applies to both viewers; the data blocks are identical.

- `3d-babylon/vendor/babylon.js` — the UMD build, loaded with a plain `<script>` tag
  (no modules, so the page itself parses from `file://`; the JSON fetch is still
  blocked there in Chrome, same as `3d/`). **8.3 MB raw, ~1.8 MB gzipped** — six times
  three's 300 KB; acceptable over Pages, but don't add more vendored libs casually.
  Replacement: `cdn.jsdelivr.net/npm/babylonjs@<version>/babylon.js`, no edits needed.
- Geometry loads from `../3d/bathroom.json` — one source of truth, the converter's
  output is not duplicated.
- The scene is **right-handed** (`scene.useRightHandedSystem = true`) so every
  coordinate, sign and yaw formula is copied verbatim from the three version.
- **Babylon-specific traps that were actually hit** (each cost a debugging round):
  - `VertexData.ComputeNormals` must be called with its **default** convention, not
    `{useRightHandedSystem: true}` — in an RHS scene Babylon treats clockwise faces
    as front, and the "correct" option gives floors whose normals all point down
    (the room renders dark from above and `twoSidedLighting` can't save it).
  - A `ReflectionProbe` does **not** render by itself: push its `cubeTexture` into
    `scene.customRenderTargets` or the mirror samples an eternally black cube. The
    probe replaces three's CubeCamera; refresh-on-change is `refreshRate =
    REFRESHRATE_RENDER_ONCE` again (the setter resets the counter).
  - The mirror-lamp/mirror separation is one line here: `light.excludedMeshes` —
    no layer juggling like in three.
  - The plan view's 5° lens needs ~20 m of camera distance; `upperRadiusLimit` (the
    fly-off guard) must be raised for that view or the camera is clamped inside the
    room. And the camera-inside test needs a **y bound**, or the top-down camera
    counts as "inside" and the added ceiling covers the plan. **The three viewer has
    that exact bug live** — its Plan view has shown the ceiling since the ceiling
    was added; fix it there or retire `3d/` when this version takes over.
  - Babylon's `bumpTexture` is a normal map, not a height map — normals are derived
    from the same seeded height fields (`normalCanvas()`), level 0.35.
  - Roughness rides in the metallic texture's **green** channel
    (`useRoughnessFromMetallicTextureGreen`, blue/alpha flags off).
  - There is no scene-wide IBL (a probe-fed environment would feedback-loop with
    the mirror): a warm `HemisphericLight` stands in for three's RoomEnvironment,
    and Babylon's punctual lights need roughly **2–3× three's intensities** for the
    same read. All values were re-tuned against screenshots of `3d/`, not copied.
  - One-finger Vrid/Flytta is the `panningMouseButton` argument of
    `camera.attachControl` — rebinding means detach + re-attach.
- **XR layer — read this before touching AR.** After several headset sessions,
  almost every Babylon XR built-in has been removed. What is left of Babylon in
  AR is session management and the XR camera; everything else is raw WebXR.
  - **`WebXRDefaultExperience.CreateAsync` must be given
    `disableHandTracking: true` and `optionalFeatures: false`.** The bundle reads
    `t.disableHandTracking || enableFeature(HAND_TRACKING)`, and that feature
    downloads `r_hand_rhs.glb` from `assets.babylonjs.com`. The failed fetch
    rejected `enterXRAsync`, which left a **live session Babylon had never
    switched to the XR camera or render loop for** — so the headset rendered the
    *desktop* camera's full-scale room, with no reticle, no countdown and no
    controls. That one bug was every symptom of the long "it spawns huge" hunt.
    Also set `WebXRMotionControllerManager.UseOnlineRepository = false`: no CDN
    fetches belong in this project at all.
  - **XR startup is raced against a 4 s timeout and finished by hand** if
    Babylon rejects *or* hangs (both observed), and the XR camera is asserted
    afterwards. That assertion is the line separating "AR" from "the desktop
    view displayed in a headset".
  - **Per-frame work runs off the raw `session.requestAnimationFrame`**, not
    Babylon's `onXRFrameObservable`, and cleanup runs off the raw session
    `'end'` event, not `onStateChangedObservable` — neither Babylon hook fires
    when we have taken over startup, and losing them cost the reticle,
    countdown and the whole desktop restore.
  - **dom-overlay does not render on William's Quest.** He never saw one button
    or hint in any session. The AR UI is therefore **real geometry**
    (`buildPanel`): billboarded plates that lazily follow you at waist height,
    hit-tested from each input source's ray or poked with a fingertip, pressed
    on `selectstart` (a pinch aimed at a plate presses it instead of placing the
    room). The DOM overlay is kept for phones but nothing depends on it. Its
    status plate showing mode + build number is the only way to read state in a
    headset — keep it.
  - Billboarded `DynamicTexture` labels need `vScale = -1; vOffset = 1` in this
    right-handed scene or they render upside down; and the panel must be added
    to `glow.addExcludedMesh`, or the glow layer bloats it into white slabs.
  - Anchors are raw (`frame.createAnchor`, pose re-read per frame). Babylon's
    `WebXRAnchorSystem` drove the placement node's *scaling* as well, which is
    why it was dropped.
  - **Behaviors and Babylon's hand visuals were tried and REVERTED after the
    first real Quest test (2026-08-14).** `SixDofDragBehavior` +
    `MultiPointerScaleBehavior` on the parented, scaled `grabProxy` corrupted the
    transform in this right-handed scene — the model spawned at ~1:1 instead of
    0.06 and a skewed duplicate appeared while rotating (known problem space:
    Babylon PR #14669, RHS behaviour threads). The hand-tracking feature's
    "generated joint spheres" drew huge and skewed on device (joint-axis /
    handedness quirks, Babylon issue #10139). Don't reintroduce either without a
    headset test in the same session.
  - What replaced them, both proven on-device patterns: two-hand pinch is the
    three viewer's matrix composition `T(mid)·Ry(Δang)·S(Δk)·T(−mid₀)·M₀`
    (`updateGesture`) — uniform scale + Y-only rotation, cannot shear — written
    into `grabProxy`'s anchor-local transform (Babylon composes row-vector
    style: `a.multiply(b)` applies a first). Hands are 25 plain spheres per hand
    placed from raw `frame.getJointPose` (`updateHands`) — raw WebXR poses are
    already scene coordinates in an RHS scene. `'hand-tracking'` stays in the
    session request; only Babylon's *feature* is gone.
  - `grabProxy` (a bare TransformNode under `anchorNode`) still carries scale,
    yaw and nudges — its local transform *is* the anchor offset, so a gesture
    can't be snapped back by the next anchor update. Room meshes are unpickable
    during AR. Placement sets the full transform **before** creating the anchor,
    so the async persistent-handle save can never capture the parked pose.
  - Hit-testing stays **raw WebXR** (viewer source + one source per tracked
    hand/controller, hand ray preferred): Babylon's hit-test feature only follows
    the viewer ray, and pointing beats looking.
  - **Anchor persistence was built, worked, and was deliberately removed**
    (2026-08-14, William's call after using it): every AR session starts with a
    fresh pinch → 3-2-1 countdown → sparkle-grow placement, because a model
    that is silently "already there" on entry reads as a bug, not a feature.
    `forgetAnchor()` still clears the `bern_ar_anchor` key old builds saved.
    Don't reintroduce restore-on-entry without an explicit prompt in the UX.
  - **Room sense (2026-08-19) — the room detects itself while you walk, with
    no setup phase.** This was a deliberate rejection of relying on Meta's
    `plane-detection` alone: it is excellent, and it is fed by Space Setup,
    which *is* the setup phase William didn't want. So it is tiered and every
    tier is optional — `plane-detection` (labelled walls/floor/ceiling/tables,
    free when the headset already has a room model) on top of **continuous
    hit-testing, which needs nothing at all**. A fan of 7 viewer-relative probe
    rays (`offsetRay`) is binned into a 12 cm voxel hash; dots pop in at 5 cm
    and settle to 1.5 cm, so a sweep of the head visibly paints the room in.
    Standing still adds nothing — you have to walk, which is the point.
    - **At least one probe ray must be near-vertical** (`[0,−3]`). A shallow
      downward ray crosses the room and lands on a *wall*, so without it the
      floor is barely sampled and the floor guess settled 0.6 m up a wall.
    - **The floor is the LOWEST well-covered surface, not the most-hit one**,
      and the y histogram counts **distinct voxels, not raw hits**. Counting
      hits made it a measure of where you happened to stare: face a wall for a
      few seconds and that bin dwarfs the floor. Both bugs were caught by the
      test rig, both would have read as "1:1 mode puts the bathroom on the
      kitchen counter" on device.
    - `floorHeight()` replaced `placedY` everywhere. 1:1 mode eases towards it
      every frame, so a room placed early still settles onto the real floor as
      the guess sharpens.
  - **The patch cloud is DEBUG-ONLY and off by default** (`debugView`, the
    "Felsökning" button). It proved the mapping is real and then became
    scaffolding: a fog of dots over the bathroom you came to look at. What stays
    on is the **plane wireframes** — the recognised surfaces, outlined — plus
    the live count on the status plate. The tinted plane fills are debug too.
  - **The hand halos LIE FLAT.** A ring hanging vertically in the air is
    ambiguous — through it? onto it? — whereas two rings lying level in front of
    you read as two places to rest your hands, which is the instruction. Babylon's
    torus is already flat in XZ, so the fix was deleting a rotation and a lookAt.
  - **Room sense draws PATCHES LYING ON THE SURFACE, not floating dots.** The
    first version put a sphere at each voxel centre and made new finds 3× the
    size of settled ones — and since new finds are always where you are looking,
    a bright cluster tracked your gaze and the whole thing read as eye-tracking.
    It never was: **468 of 468 recorded points sat exactly on a real surface**
    (`viewer.ar.voxels()` exists so that can be re-checked, not argued about).
    Each patch is a flat disc rotated onto the normal that the hit-test pose
    carries on its +Y axis, tinted by orientation — floor green, walls amber,
    ceiling blue — and lifted 1 mm along that normal so it doesn't z-fight with
    the surface it describes. **It all disappears once the room is placed.**
  - **Placement is two labelled rings and a cancellable count.** Two halos
    appear at hand height reading "Håll händerna här"; fill both and a visible
    3-2-1 runs; take a hand away and it **aborts**, not pauses. The brief was
    that the bathroom must never appear as a surprise. Rings must be excluded
    from the glow layer — bloomed, two 16 cm targets 40 cm from your eyes read
    as headlights.
  - **The control panel gets out of the way.** Five plates parked in front of
    you permanently is a nag. They sit at 16 % opacity and come back when you
    **raise a hand** (`handsAreUp`, wrist within 45 cm of eye level) — the
    gesture you would make to reach for them anyway. Hidden entirely before
    placement, and a ghosted panel is not hit-testable, or you would press
    buttons you cannot see by sweeping a hand past them.
  - **Cube pets.** Cup both palms up and together for half a second and one of
    24 Kenney *Cube Pets* (CC0, `assets/pets/`) drops into your hands. Lazy-
    loaded one GLB at a time, so the page still costs nothing until you ask.
    - The GLBs reference an **external** `Textures/colormap.png` — copy that
      folder too or every load 404s on the texture.
    - `vendor/babylon.loaders.js` is needed: the core UMD bundle has
      `SceneLoader` but no format plugins. 564 KB, but minified — 136 KB
      gzipped, against the 1.8 MB the core already costs.
    - Models are 1.2–1.9 m in their own units and vary per species, so each is
      **normalised** so its tallest axis is `PET_SIZE`, and an inner node
      re-centres it (they are authored with their feet at the origin, and the
      physics wants a centre). The `idle` animation group is played looped.
    - **Physics is Havok** (`vendor/HavokPhysics_umd.js` + `.wasm`, MIT, 2 MB /
      660 KB gzipped), loaded lazily on the first spawn. It replaced a
      hand-rolled sphere-in-an-AABB integrator that had **no pet-to-pet
      collision at all**, only ball shapes, and bounced them inside the model's
      outer box — which includes wall thickness, so animals rested slightly
      inside the tiles.
    - **Havok simulates in WORLD space, and this room gets moved and scaled.**
      So pets are world-space bodies with no parent; the room is six static
      collider boxes built from `clearFloorBox()` and the room's world matrix;
      and everything that changes that matrix calls `rebuildPhysics()`, which
      also carries the pets along by the delta so they aren't left standing
      where the bathroom used to be. Gravity is scaled by the room scale, or a
      1 cm animal in a doll's house drops like a bullet.
    - `inner` is `{w, d}`, NOT a box — using it as one gave the pets nothing to
      land on and they fell forever past y = −3. `clearFloorBox()` derives the
      real interior from the floor meshes.
    - A `PhysicsBody` reads the node's WORLD transform at construction, so call
      `computeWorldMatrix(true)` first or every pet starts at the origin.
    - Shapes are **boxes, not spheres**: a cube pet that lands on its side
      should stay there, which a ball can never do.
  - **One pinch picks things up** — a pet if your fingers are within 22 cm of
    one, the whole bathroom otherwise (translation only). A second pinch
    escalates to the two-handed grow/turn, which drops both.
  - **Refreshing the mirror probe is SIX full scene renders** — measured at
    8.6 ms median against a 2.4 ms ordinary frame, which is most of a Quest's
    13.9 ms budget at 72 Hz. Two things follow, both measured rather than
    assumed:
    - **Pets are excluded from the probe's render list.** Eight of them pushed
      it from 106 meshes to 155 and the refresh from 10.1 ms to 15.2 ms.
    - **An adaptive cube resolution was tried and REMOVED.** Dropping 512 → 192
      changed the cost by nothing measurable: six scene renders are bound by
      draw calls, not pixels. What is left is `mirrorInView()` — do not refresh
      a reflection nobody is looking at, which in a 2.28 m room is most of the
      time.
  - **`FUN`: things you can touch.** Water at the tap and the rain head (an
    unlit column with a scrolling streak texture, plus a breathing ripple), a
    generated WC lid hinged at the bowl rim, and a stick figure that exists
    ONLY inside the mirror — switched on by the reflection probe's
    `onBeforeRenderObservable` and off again after, so it lands in the cube map
    and never in the room. Coordinates were read off the IFC (spout at y 0.902,
    bowl rim 0.44, rain head 1.95), not guessed. Note the basin is a **solid
    block** 0.715–0.85, not a hollow bowl, so the tap stream is 5 cm long.
    - Touching requires a **reach**: the fingertip must be ≥ 0.28 m ahead of the
      head. Without it, walking through the room with your arms down swept the
      fittings and turned the tap on by itself.
    - **Scroll the water texture with `vOffset +=`, not `-=`.** Increasing it
      samples further up the texture for a given point on the strand, which
      slides the pattern DOWN. Subtracting ran the water up out of the basin.
    - **The rain head DISC is at z −0.14, not the arm's centroid at −0.26.**
      Binning the shower mesh by z and taking the widest rows is what found it;
      the stream had been hanging 6 cm behind the head in mid-air.
    - **A stream is a BUNDLE OF THIN STRANDS plus expanding splash rings**, not
      one fat cylinder — 18 strands for the rain head, 1 for the tap, each
      jittering on its own phase. A single cylinder read as a paper cup at the
      tap and a milky panel in the shower. Splash rings must be scaled on all
      three axes: scaling x/z only leaves the torus its built tube height, so a
      3 cm ring wears a 5 cm collar and reads as a plastic washer.
    - **Water is transparent gaps between hard streaks, not a tinted sheet.**
      A high uniform base alpha made the column read as a milky panel stuck to
      the wall. Both ends of each stream are measured off the mesh — the spout
      underside is y 0.885 and the basin dips to 0.782 beneath it; an estimated
      pair of ends left the stream hanging beside the tap.
    - **It is a DOLL, not a person.** Over-large head, stubby rounded limbs,
      warm painted-wood tone, and — the single biggest thing — **a face**: two
      eyes and a mouth on the front of the head. A dark, faceless, correctly
      proportioned figure standing in your mirror is a horror-film shot; the
      same rig with a toy's proportions and a painted face is funny. Nothing
      about the skeleton changed.
    - **The mirror figure is an articulated mannequin that copies you.** Head,
      neck, torso, hips and jointed arms and legs with spheres at every joint —
      generated, no assets. The rig is authored at 1.70 m and scaled to your
      measured eye height, stands where you stand, faces where you face, and
      **its arms follow your tracked wrists** through a two-bone IK
      (`solveIK`, elbows folding back-and-down, knees forward). The figure is
      YOU, not your mirror image — the glass does the flipping — so a raised
      left hand raises the figure's left hand. `viewer.ar.figurePose()` exposes
      the joints so "does it copy my arms?" is a number, not a squint.
      Re-rendering the probe costs six cube faces, so the pose is quantised
      (4 cm / 6°) and throttled to 5 Hz.
    - **The mirror figure's distance from the glass is everything.** At 0.42 m
      it fills the disc as a black blob; at 0.72 m the mirror goes uniform grey,
      and the grey IS the figure; around 0.9 m it frames head and shoulders. In
      AR it therefore follows YOU (`updateMirrorFigure`, throttled to 0.18 m of
      travel and 400 ms because each move re-renders six cube faces), which
      fixes the framing for free and is a better joke besides. The probe is 512,
      not 256 — at 256 anything recognisable in it is visibly blocky.
    - `refreshProbeList()` must be re-run after these are built — they are
      created long after start-up, and without it none of them appear in the
      one surface whose job is to show them.
  - **The placement marker is the room's own footprint, not a halo** — a
    rectangle at the real placement scale with corner ticks and a notch on the
    doorway side. You can see what you are about to place *and which way it
    faces*, which is what makes the yaw correct-by-inspection on device.
  - **`SPAWN_YAW_OFFSET` is 0.** It was `Math.PI` and the room spawned 180° out
    every session — you got the back of the WC wall instead of the doorway.
    Named constant now; `yawTowardsViewer()` is shared by the preview and by
    `startPlacement` so the two cannot disagree (they did: the palm path moves
    the marker at the last moment and left the room 16° out).
  - **"Hold both hands out in front of you" places the room** (`updateHandsForward`,
    900 ms, a bar fills between your wrists). Added *alongside* pinch and
    palm-dwell, never instead of — pinch is the path proven on device. The
    thresholds are deliberately narrow: a looser first version fired off hands
    resting at your sides and the room placed itself on entry.
  - **Hand dots are tiered, not uniform** (`HAND_TIER`): fingertips legible,
    knuckles almost gone. All 25 joints at equal size and brightness is what
    read as "weird skeleton hands". Also `flatPalm()` now rejects a degenerate
    palm normal — `NaN > -0.72` is false, so a malformed hand read as *palm
    down* and placed the room by itself.
  - `#top[hidden], #ui[hidden]{display:none !important}` is load-bearing, same
    trap as `#arOverlay[hidden]`: an id selector's `display:flex` beats the
    `hidden` attribute, so the desktop chrome sat on screen through the whole
    AR session.
  - `unbounded` is requested **optionally** (Quest Browser has historically not
    implemented it); `local-floor` stays the reference space. How far you can
    actually walk is a Guardian question, not a code one.
  - Palm-down dwell, contact-shadow blob, mood/door behaviour, embed mode:
    ported unchanged.
  - **Placement is a ceremony, not a swap:** pinch → a billboarded 3-2-1 over
    the spot → a sparkle burst → the room grows in with an easeOutBack
    overshoot. An instant appearance reads as a glitch; the count also gives you
    a beat to abort. The palm-dwell path skips the count — its filling ring
    already was one.
  - **Miniature ↔ 1:1 is a toggle inside the session**, not just a choice of
    entry button (they are easy to mis-tap with hand tracking, and picking the
    wrong one should not decide the whole experience). Going 1:1 drops the room
    to real floor level and makes the walls 45 % see-through so you can walk in
    without barking a shin; the walls button flips solid/see-through and names
    its own state. **The floor drop is applied to the anchor-RELATIVE node** —
    put it on `anchorNode` and the next anchor pose clobbers it, leaving a
    life-size room floating at table height.
- **`tools/xr-mock.js` is a fake WebXR runtime for testing AR in a browser**, and
  **`3d-babylon/?xrtest=1` is a 32-assertion suite that drives the real code
  path through it** (result on `window.__arTest`). `?xrmock=1` loads the mock
  alone for poking at by hand; both are opt-in and load nothing otherwise.
  `?debug=1` adds a live transform readout. `window.viewer.ar.state()` is the
  single readout everything asserts against.
  - The mock models a 4×3 m room with walls, ceiling and a table, and
    **ray-marches it** — hit-test results move as the fake person looks around,
    which is the only way room-sense accumulation can be exercised at all. It
    has a walking, yawing, **pitching** viewer (`walk`, `look`), detected planes
    with semantic labels, posable hands (`handsForward`, `handsPose`,
    `palmDown`) and pinches that fire real `selectstart`/`selectend`.
  - **Mock realism is load-bearing.** Six separate bugs were masked by a sloppy
    mock: hands defaulting to the gesture pose (so the room placed itself before
    any assertion ran), a degenerate hand layout whose palm normal was NaN, a
    palm-down hand whose ray still pointed forwards, hit poses with no surface
    normal, `handAt` solving against the pitched basis when hands are placed
    with the yaw-only one (so reaching *down* for the tap silently missed), and
    — the one that reached the user — **a hard-coded projection matrix at
    aspect 1.31 against a 1.60 canvas**, which stretched every recorded frame
    22 % and made the bathroom "look a bit skewed". The model was never skewed;
    the simulator's lens was. The suite now asserts lens aspect == canvas
    aspect, because a wrong lens invalidates every visual judgement made from a
    recording.
  - Load the mock **cache-busted**. A stale copy in the browser cache produced
    "s.handAt is not a function" against a mock that plainly had it.
  - Assert on numbers (`grabProxy.scaling` is 0.06 in tabletop, 1.0 at 1:1;
    the sensed floor is 0; the spawn yaw faces the viewer) rather than shipping
    a guess and waiting for a human to try it. Every bug above was found this
    way after being reported from the headset in prose.
- **`AR-PLAN.md`** holds the design rationale for the room-sense work and what
  was deliberately left out (real-room corner alignment, depth-sensing occlusion).
- **Verified with chrome-devtools MCP** (2026-08-14): 1440 px and 390 px, sv and zh,
  iso/plan/walk, both moods, door open/closed, cement swap (gating intact), all
  towel options (vanity shift intact), tooltip, `?embed=1`, no console errors.
  **The XR paths are untested on hardware** — same caveat as `3d/`, now for both.

## Architecture of index.html (all data-driven — edit data, not markup)
Data lives in `<script>` near the bottom:
- `PRODUCTS` — the 7 selected items. Each: `id, num, cat, name, brand, supplier, art, specs, pills, list, offer, budgetKey, url, docs, alternatives[]`. Pill class `pick` is the black "Ruiyings val" badge.
- `ADDONS` — budget extras that aren't hero products: concealed mixer bracket, bottenventil, överfyllnadsring, Golvpoolen freight.
- `GAPS` — design elements not yet selected (cabinet, LED, glass wall, spots, microcement, niche).
- `MICRO_SUPPLIERS` — beige microcement suppliers (Göteborg) + notes.
- `MICRO_CONTACTS` — 19-firm phone directory for the "Kontakta idag" accordion, researched 2026-07-31.
  Grouped `installer | showroom | shop`; each has `phone/tel/email/addr/url` plus **bilingual** `hours`,
  optional `rev` (reviews), and `tip` (what to ask them). `tip`/`hours`/`rev` are **authored HTML** —
  `<b>` allowed, not escaped by `renderContacts`. Order within each group is our recommended call order.
- `I18N` — translation dict. **Swedish (`sv`) is default; Mandarin (`zh`) is the toggle.** No English.

### Page structure (rewritten 2026-08-10, revised same day)
The page is ordered **primary → secondary** so the main selections are what you meet first:
1. The index (`nav.toc`) — set like a book contents page with dotted leaders and no box, directly under the header and above the hero. Hand-maintained list of section ids. → 2. the single **Svart** style tab → 3. Valda artiklar → Rummet i 3D → Visualiseringar → Öppna beslut → I designen, ännu ej valt.
Then a `.grouphead` divider ("Referens & underlag") and the **secondary** accordions — `details.acc.sec`, dashed border, transparent until opened, muted title: Kulörjämförelse, Mikrocement, Kontakta idag, Budgetdetaljer.
- **Matt-silver is gone.** The tab, the panel, the `body[data-style="silver"]` overrides and the dead `silver_*` i18n keys were all removed. `setStyle()` is kept but pinned to `black`.
- **Alternatives are deliberately quiet:** each product's carousel now lives inside a collapsed `details.alts` ("Visa alternativ · N") with muted cards. keen-slider measures zero width inside a closed `<details>`, so `buildSlider(pid)` is called lazily from the `ontoggle` handler and `sliders` is keyed by product id, not an array.
- `revealSection(id)` backs both the TOC links and `#hash` arrivals: it opens the target `<details>` before scrolling, and kicks `load3D()` for the 3D section.
- **Link previews matter here** — the page is shared as a bare URL over WhatsApp/Signal, so `<head>` carries og/twitter tags with **absolute** image URLs (scrapers don't resolve relative ones) and an inline SVG favicon. Update `og:url`/`og:image` if the deploy URL ever changes.
- **Budget table's second column is the supplier**, not a "vald/tillbehör" tag — with the cart split across Golvpoolen, Westerbergs, Spegelshoppen, StudioNord and Bernstein, "where do I buy this line" is the question that column has to answer. `ADDONS` entries carry a `supplier` field for the same reason.
- A few labels interpolate a count via `%n` + a `data-n` attribute (e.g. `alts_toggle` → "Visa 5 alternativ"); `setLang()` does the substitution, so don't simplify it back to a plain `textContent =`.
- The contact cards' phone link sits **outside** `<summary>` and is positioned onto that row with CSS. A link inside a summary is invalid and competes with the toggle for activation; this keeps valid markup, the same look, and one-tap calling.
- **No summary stat cards.** They were removed as bloat; the only totals live in the budget table and the "Valda artiklar" summary chip, both computed from `PRODUCTS`+`ADDONS`. Don't reintroduce hard-coded numbers.
- **Decisions are a to-do list**, not cards: `DECISIONS` (`[state, headingKey, bodyKey, ownerKey]`) renders into "Kvar att göra" and "Klart" via `renderDecisions()`. The state is the single source for the section's count chip. Moving an item is a one-word edit — that's the point.
- The 3D iframe is **lazy** — a poster with a "Ladda 3D-vyn" button, so the ~1.6 MB viewer isn't downloaded on page load.

Rendered by `renderItems / renderBudget / renderGaps / renderMicro / renderTotals / renderAlternatives / renderContacts`.
`tr(key, lang)` takes an optional lang (defaults `sv`) so data-driven renderers can localize directly.
Budget stat-cards, item count, and budget table all compute from `PRODUCTS`+`ADDONS` — never hard-code totals.
`setLang(l)` re-applies `data-i18n` textContent, updates dynamic bits, `labelizeTables()`, and `renderAlternatives(l)`.
`setStyle(s)` is now a no-op pinned to `black` (kept so the 3D viewer's localStorage contract still holds).

### Alternatives carousel
- Each product has 4–5 real Swedish-market `alternatives[]`, **sorted by `rel` (relevance %) desc**. Superseded former main picks live here too (the Bygghemma vanity listing, Bernstein PRO+ 1104) — demoted, not deleted. Fields: `name, supplier, price, url, rel, cmp:[{sv,zh}...]` (≤10 terse bilingual comparison points vs the main pick).
- Rendered as muted cards in a **keen-slider** carousel (CDN in `<head>`): 3-up desktop, 1-up mobile, dots via `dotsPlugin`. Built lazily on `<details>` open; re-inits on language switch.
- Comparison-point style: terse (≤6 words), `+`/`−` for more/less/cheaper/pricier/better/worse. Keep it un-bloated.

### Images (`inventory/product-images/`)
- Naming: `main-<id>.jpg` and `alt-<id><n>.jpg` (n = slide index+1, matching relevance order). Render **derives** paths from `p.id`+index — no `img` field in data. `onerror` → tinted placeholder.
- Sourced from each site's og:image / gallery image, downloaded locally + normalized to JPEG (avoids hotlink blocks and the cookie-overlay dimming that ruined the old full-page screenshots — **don't use full-page screenshots for product images**).
- **Bygghemma-group gotcha:** the `img.bygghemma.se/pimages/...` og URLs 404 on direct fetch. Use the **gallery UUID format** instead (`img.bygghemma.se/<uuid>/<file>.jpg?auto=format,compress&w=900`), grabbed from the live product page's DOM. Same for `img.badshop.se` and `bhgst.imgix.net`.
- Bauhaus/Hornbach/Beliani og:image only resolves via a real browser (JS), not curl. CDON is Cloudflare-blocked (LuxeBath drain alt has no image → placeholder).
- `sips -s format jpeg` fails on WebP/AVIF; request `fm=jpg` or the UUID gallery URL.

## Files
```
index.html                      the whole site (data + render + i18n + styles)
INVENTORY.md                    human-readable inventory + microcement research
HANDOVER.md                     state of the 3D work + what's still open
design/…skiss.pdf               architect drawing (hero image = design-drawing.png rendered from it)
design/…skiss.ifc               same drawing as 3D geometry — source for the viewer
design/…skiss.dwg               AutoCAD version (binary, 2D, unused so far)
reference/design-drawing.png    rasterized skiss (pdftoppm -r 200), used as hero
reference/current-state-*.jpg   GIT-IGNORED, private
inventory/spec-sheets/          downloaded product manuals/måttskisser (mains only)
inventory/product-images/       34 clean product photos (mains + alternatives)
3d/index.html                   the 3D viewer (self-contained, same pattern as index.html)
3d/bathroom.json                triangulated geometry, generated from the IFC
3d/vendor/                      Three.js r169
3d-babylon/index.html           Babylon.js rebuild of the viewer (not yet linked from the dossier)
3d-babylon/vendor/babylon.js    Babylon.js 9.21.1 UMD build
tools/ifc_to_json.py            IFC → JSON converter
private/                        GIT-IGNORED working material (email, old study)
```

## Conventions
- Fonts: Fraunces (display) + Spectral (body) + Noto Sans SC (zh). Warm oak/black palette — one theme only.
- Tables render as stacked cards on mobile (≤760px) via `data-label` copied from localized `<th>` in `labelizeTables()`.
- Prices are SEK incl. VAT. `fmt()` groups thousands with a space. Some alt prices are approximate — treat `rel` + comparison points as the reliable signal.
- Verify visually with the chrome-devtools MCP (emulate 360–390px mobile + desktop, both languages) before pushing.

## Open threads / next steps
- **XR needs a real device pass — in both viewers.** The WebXR paths (three's hand-rolled one and Babylon's built-in one) have only been exercised in a desktop browser. Test in a headset over the HTTPS Pages URL before promising them to anyone.
- **The dossier now loads `3d-babylon/`** (iframe + "open in a new tab", switched 2026-08-20 on William's call). `3d/` is retired in place — untouched, still has its Plan-view ceiling bug, no longer reachable from the dossier. Delete it once the Babylon build has survived a headset pass.
- LED alternatives for the vanity/cabinet integrated lighting still to source (own `GAPS` row).
- Microcement: order free samples from 2–3 Göteborg suppliers; confirm with Z Bygg who lays the tätskikt (microcement is a surface layer, needs a BBV/GVK-certified waterproofing under it).
- A couple of alt photos are low-res (Bauhaus/Beliani thumbnails); could re-grab higher-res.
