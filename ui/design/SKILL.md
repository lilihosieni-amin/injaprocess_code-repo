---
name: inja-food-design
description: Use this skill to generate well-branded interfaces and assets for Inja Food (اینجا فست‌فود) — the restaurant process-documentation system — for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components. Persian-first, RTL.
user-invocable: true
---

Read `readme.md` in this skill, then explore the other files.

- Foundations live in `styles.css` → `tokens/*.css` (colors, type, spacing, effects). Link `styles.css` and use the CSS custom properties; never hard-code hexes when a token exists.
- Reusable primitives are in `components/` (`core/`, `forms/`, `surfaces/`, `flow/`) as `<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`.
- A full click-through recreation of the app is in `ui_kits/inja/index.html`.
- The brand mark is `assets/inja-logo.jpg` — the only raster asset.

Rules of the house: Persian/RTL throughout; Persian digits (۰۱۲۳…); warm cream background, violet brand + coral accent; **no gradients**; soft violet-tinted shadows; line-SVG icons only, no emoji; generous rounding.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and produce static HTML files for the user to view. If working on production code, copy assets and read the rules here to design as an expert in this brand. If invoked with no guidance, ask what to build, ask a few questions, then act as an expert designer outputting HTML artifacts or production code.
