# Downstairs Bathroom — project notes

Single-page material dossier for the Bernting downstairs-bathroom renovation. It's a
static site (`index.html`) plus supporting assets, published via GitHub Pages and shared
with Ruiying. No build step, no framework — one HTML file with inline CSS + JS.

## Parties & design
- **Architect:** Studio Streck (design by Martin Häger, skiss dated 2026-04-14). Drawing: `design/BERNTING_BADRUM_LAYOUT_SKISS_260414.pdf`.
- **Carpenter / VVS:** Zäta / Z Bygg. They asked us to buy materials ourselves.
- **Design intent:** microcement (warm beige) walls+floor, matt-black fixtures, oak vanity, wall-hung WC, rain shower + glass wall, round LED mirror, custom LED wall cabinet, linear tileable floor drain, 5 spotlights. All pipe runs concealed.

## Deploy
- Repo: `wbern/downstairs-bathroom` (public — required for free Pages; not indexed unless linked).
- **Live URL:** https://pages.bernting.se/downstairs-bathroom/ (custom Pages domain on the account; HTTPS enforced).
- Workflow: commit → `git push origin main` → Pages rebuilds (~1 min). Check build:
  `gh api /repos/wbern/downstairs-bathroom/pages/builds/latest -q .status` (wait for `built`).
- Commit author is set per-commit (`git -c user.name="wbern" -c user.email="kenneth.bernting@me.com"`); end messages with the Claude co-author trailer.

## Privacy
- `reference/current-state-panorama.jpg` (mirror selfie showing a person) is **git-ignored and never published**. Keep it that way. Everything else (drawing, product photos, spec PDFs, budget) is impersonal.

## Architecture of index.html (all data-driven — edit data, not markup)
Data lives in `<script>` near the bottom:
- `PRODUCTS` — the 7 selected items (the "Svart" style). Each: `id, num, cat, name, brand, supplier, art, specs, pills, list, offer, budgetKey, url, docs, alternatives[]`.
- `ADDONS` — required extras in the budget (concealed bracket, drain kit, overflow ring).
- `GAPS` — design elements not yet selected (cabinet, LED, glass wall, spots, microcement, niche).
- `MICRO_SUPPLIERS` — beige microcement suppliers (Göteborg) + notes.
- `I18N` — translation dict. **Swedish (`sv`) is default; Mandarin (`zh`) is the toggle.** No English.

Rendered by `renderItems / renderBudget / renderGaps / renderMicro / renderTotals / renderAlternatives`.
Budget stat-cards, item count, and budget table all compute from `PRODUCTS`+`ADDONS` — never hard-code totals.
`setLang(l)` re-applies `data-i18n` textContent, updates dynamic bits, `labelizeTables()`, and `renderAlternatives(l)`.
`setStyle(s)` switches Svart/Matt-silver themes (CSS var overrides on `body[data-style]`); persists in localStorage.

### Alternatives carousel
- Each product has 4 real Swedish-market `alternatives[]`, **sorted by `rel` (relevance %) desc**. Fields: `name, supplier, price, url, rel, cmp:[{sv,zh}...]` (≤10 terse bilingual comparison points vs the main pick).
- Rendered as full cards in a **keen-slider** carousel (CDN in `<head>`): 3-up desktop, 1-up mobile, dots via `dotsPlugin`. Re-inits on language switch.
- Comparison-point style: terse (≤6 words), `+`/`−` for more/less/cheaper/pricier/better/worse. Keep it un-bloated.

### Images (`inventory/product-images/`)
- Naming: `main-<id>.jpg` and `alt-<id><n>.jpg` (n = slide index+1, matching relevance order). Render **derives** paths from `p.id`+index — no `img` field in data. `onerror` → tinted placeholder.
- Sourced from each site's og:image / gallery image, downloaded locally + normalized to JPEG (avoids hotlink blocks and the cookie-overlay dimming that ruined the old full-page screenshots — **don't use full-page screenshots for product images**).
- **Bygghemma-group gotcha:** the `img.bygghemma.se/pimages/...` og URLs 404 on direct fetch. Use the **gallery UUID format** instead (`img.bygghemma.se/<uuid>/<file>.jpg?auto=format,compress&w=900`), grabbed from the live product page's DOM. Same for `img.badshop.se` and `bhgst.imgix.net`.
- Bauhaus/Hornbach/Beliani og:image only resolves via a real browser (JS), not curl. CDON is Cloudflare-blocked (LuxeBath drain alt has no image → placeholder).
- `sips -s format jpeg` fails on WebP/AVIF; request `fm=jpg` or the UUID gallery URL.

## Files
```
index.html                     the whole site (data + render + i18n + styles)
INVENTORY.md                    human-readable inventory + microcement research
design/…skiss.pdf               architect drawing (hero image = design-drawing.png rendered from it)
reference/design-drawing.png    rasterized skiss (pdftoppm -r 200), used as hero
reference/current-state-*.jpg   GIT-IGNORED, private
inventory/spec-sheets/          downloaded product manuals/måttskisser (mains only)
inventory/product-images/       34 clean product photos (mains + alternatives)
```

## Conventions
- Fonts: Fraunces (display) + Spectral (body) + Noto Sans SC (zh). Warm oak/black palette; matt-silver theme is a cooler grey variant.
- Tables render as stacked cards on mobile (≤760px) via `data-label` copied from localized `<th>` in `labelizeTables()`.
- Prices are SEK incl. VAT. `fmt()` groups thousands with a space. Some alt prices are approximate — treat `rel` + comparison points as the reliable signal.
- Verify visually with the chrome-devtools MCP (emulate 360–390px mobile + desktop, both languages) before pushing.

## Open threads / next steps
- **Matt-silver style** is a scaffold (a table of which picks exist in silver/steel/chrome) — populate 2–3 full silver variants when asked.
- LED alternatives for the vanity/cabinet integrated lighting still to source (own `GAPS` row).
- Microcement: order free samples from 2–3 Göteborg suppliers; confirm with Z Bygg who lays the tätskikt (microcement is a surface layer, needs a BBV/GVK-certified waterproofing under it).
- A couple of alt photos are low-res (Bauhaus/Beliani thumbnails); could re-grab higher-res.
