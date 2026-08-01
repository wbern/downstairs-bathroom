# Bathroom visualization set

These images are AI-generated judgement renders based on the Studio Streck
IFC/drawing, the selected product images in `inventory/product-images/main-*.jpg`,
and the material/lighting brief below. No alternative product images were used.

They are intended to judge the overall combination, colour, light and visual
weight. They are not construction drawings or dimensionally exact product
renders; final clearances, mounting heights, connections and product dimensions
must follow the drawing, product sheets and site measurements.

## Images

- `00-contact-sheet.jpg` — overview of all five views.
- `01-doorway-evaluation.png` — primary daylight/evaluation view from the doorway.
- `02-vanity-wc-diagonal.png` — vanity, mirror, cabinet and WC relationship.
- `03-shower-detail.png` — shower, niche, clear glass and tileable drain.
- `04-reverse-towel-warmer.png` — reverse view showing the Ella towel warmer and
  outward door swing.
- `05-doorway-evening.png` — evening mood study from the primary camera.

## Fixed brief

- Geometry: the Studio Streck layout, using the IFC/3D viewer as the spatial
  control; clear floor approximately 2.28 × 1.13 m and ceiling 2.13 m.
- Surface: Konkral Microcement Smooth in Macchiato, represented as a smooth,
  matte-sealed warm beige with a restrained light red/blush undertone. The
  working digital reference was `#CEC1B1`; a physical sealed sample in the real
  room remains authoritative.
- Selected products: Bathlife Charm 610 mm oak vanity and basin; Westerbergs
  Loxia Låg matt-black mixer; Westerbergs Forsa CC160 black rain shower;
  Spegelshoppen round heated LED mirror Ø600; StudioNord Ella 427 × 800 mm
  matt-black towel warmer; Bernstein PRO+ 1104 white wall-hung shower toilet;
  Bernstein GT01 1000 mm tileable linear drain.
- Unselected design elements are kept generic: custom oak wall cabinet, shower
  glass, recessed spots, LED strips and shower niche.
- Evaluation lighting: warm 3000 K, high colour rendering (CRI 90+ intent), five
  discreet white recessed spots, plus the mirror, niche, cabinet and
  under-vanity light layers.
- Evening lighting: dimmed 2700 K spots and indirect LEDs, with the selected
  mirror light off because its specified minimum is 3000 K.
- Styling: no people, towels, toiletries, plants or decorative props.

## Generation prompt set

Mode: OpenAI built-in image generation, using the 3D views/drawing for geometry,
the selected-product contact sheet for identity, and a neutral Macchiato swatch
for colour control.

All daytime prompts asked for a restrained, photorealistic Scandinavian bathroom
evaluation render with the fixed brief above, accurate compact-room proportions,
smooth low-sheen microcement, natural oak, matt-black fixtures, white sanitary
ware, clear low-iron shower glass and realistic 3000 K lighting. They explicitly
forbade alternative products, layout changes, decorative styling, text and
exaggerated cinematic colour grading.

Angle-specific instructions:

1. Doorway: show the full room relationship—shower and niche left, floating
   vanity and round mirror centre, cabinet and WC right.
2. Vanity/WC diagonal: prioritise the 610 mm floating vanity, black mixer,
   Ø600 mirror, under-vanity light, cabinet and wall-hung WC; keep the floor
   continuous below the vanity.
3. Shower detail: show the full black rain-shower set, recessed lit niche,
   colour-neutral clear glass and the tileable drain as a thin perimeter slot.
4. Reverse/towel: show the tall five-rung Ella ladder warmer at its intended
   visual scale and the bathroom door opening outward into the hall.
5. Evening: preserve the primary view exactly; remove daylight, dim the 2700 K
   spot/indirect layers, switch the mirror light off, and keep Macchiato readable
   without shifting it toward orange, brown or terracotta.

## Visual review and revisions

The final set was selected after reviewing the generated images together. Earlier
passes were revised to reduce an amber/brown material cast, remove a false
microcement support below the floating vanity, neutralise the green edge tint in
the shower glass, and correct the bathroom door to swing outward.
