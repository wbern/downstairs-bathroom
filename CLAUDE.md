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
- `3d/vendor/` — Three.js r169 vendored (no build step, works offline, matches the site's no-framework rule). 1.3 MB raw, ~300 KB gzipped by Pages.
- Shares `bern_lang` localStorage with the dossier so language carries across both pages. `bern_style` is still written for compatibility but only ever holds `black` now.
- **Materials are procedurally generated** (`makeTexSet()`): microcement, oiled oak, brushed metal and porcelain colour/roughness/bump maps are drawn on a canvas at load from seeded value noise — no texture files, works offline, no build step. UVs come from `addBoxUV()`, which projects each vertex along its normal's dominant axis in metres, so a style's `scale` reads literally as "one tile per N metres".
- **VR:** `navigator.xr` support adds a **VR** button to the top bar; it uses a `local-floor` reference space and parks an `xrRig` just inside the doorway. The model's floor is already at y = 0 in metres, so no scaling is involved. Tested only in the browser — needs a real headset pass over HTTPS.
- **Embedded mode:** `3d/?embed=1` is what the dossier's "Rummet i 3D" accordion loads in an iframe. It hides the redundant back-link/title, retargets links to `_top`, and starts with the control panel collapsed.
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

### Page structure (rewritten 2026-08-10)
The page is ordered **primary → secondary** so the main selections are what you meet first:
1. TOC (`nav.toc`, hand-maintained list of section ids) → 2. the single **Svart** style tab → 3. Valda artiklar → Rummet i 3D → Visualiseringar → Öppna beslut → I designen, ännu ej valt.
Then a `.grouphead` divider ("Referens & underlag") and the **secondary** accordions — `details.acc.sec`, dashed border, transparent until opened, muted title: Kulörjämförelse, Mikrocement, Kontakta idag, Budgetdetaljer.
- **Matt-silver is gone.** The tab, the panel, the `body[data-style="silver"]` overrides and the dead `silver_*` i18n keys were all removed. `setStyle()` is kept but pinned to `black`.
- **Alternatives are deliberately quiet:** each product's carousel now lives inside a collapsed `details.alts` ("Visa alternativ · N") with muted cards. keen-slider measures zero width inside a closed `<details>`, so `buildSlider(pid)` is called lazily from the `ontoggle` handler and `sliders` is keyed by product id, not an array.
- `revealSection(id)` backs both the TOC links and `#hash` arrivals: it opens the target `<details>` before scrolling, and kicks `load3D()` for the 3D section.
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
tools/ifc_to_json.py            IFC → JSON converter
private/                        GIT-IGNORED working material (email, old study)
```

## Conventions
- Fonts: Fraunces (display) + Spectral (body) + Noto Sans SC (zh). Warm oak/black palette — one theme only.
- Tables render as stacked cards on mobile (≤760px) via `data-label` copied from localized `<th>` in `labelizeTables()`.
- Prices are SEK incl. VAT. `fmt()` groups thousands with a space. Some alt prices are approximate — treat `rel` + comparison points as the reliable signal.
- Verify visually with the chrome-devtools MCP (emulate 360–390px mobile + desktop, both languages) before pushing.

## Open threads / next steps
- **VR needs a real device pass:** the WebXR path is wired but has only been exercised in a desktop browser. Test in a headset over the HTTPS Pages URL before promising it to anyone.
- LED alternatives for the vanity/cabinet integrated lighting still to source (own `GAPS` row).
- Microcement: order free samples from 2–3 Göteborg suppliers; confirm with Z Bygg who lays the tätskikt (microcement is a surface layer, needs a BBV/GVK-certified waterproofing under it).
- A couple of alt photos are low-res (Bauhaus/Beliani thumbnails); could re-grab higher-res.
