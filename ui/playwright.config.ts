import { defineConfig } from '@playwright/test'

/**
 * R6 — the gate vitest cannot be. jsdom computes no layout, no colour and no
 * font metrics, so a screen can pass every unit test and still look wrong.
 *
 * `channel: 'chrome'` drives the Chrome already installed at
 * /usr/bin/google-chrome. Nothing is downloaded: the network here is
 * restricted, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set at install time.
 *
 * The target is a **build of the working tree**, served by `vite preview` — not
 * the container on :8000, whose `ui/dist` was built at some earlier moment, so a
 * check pointed at it would grade a stale snapshot rather than the working tree,
 * precisely the drift R6 exists to catch. The build runs inside the `webServer`
 * command below, so what is graded is always the tree as it stood when the run
 * started; and it is a *frozen* copy of it, which the dev server cannot be (see
 * `webServer`). The specs stub every read endpoint and abort anything unstubbed
 * (see `_harness.ts`), so the server needs no backend behind it — and `preview`
 * inherits `server.proxy` from vite.config.ts, so the `:8000` fall-through those
 * comments describe as the thing being prevented is unchanged.
 *
 * Three projects, one per width the design specifies: 1440 (desktop),
 * 1080 (the first breakpoint) and 760 (the mobile pass). Every screen check
 * runs at all three.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chrome',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    // Screenshots are for comparison against ui/design/, so nothing may move
    // under the camera.
    //
    // Under `contextOptions`, not beside `viewport`: in @playwright/test 1.61
    // `reducedMotion` is a BrowserContext option and is NOT a member of
    // `PlaywrightTestOptions`. Written at the top level of `use` it type-errors
    // — and, measured here, the run still goes green with
    // `matchMedia('(prefers-reduced-motion: reduce)').matches === false`. A
    // setting that is legal-looking, silently inert and green is the exact
    // failure mode this whole harness exists to catch, so it is asserted:
    // see `expectReducedMotion` in `_harness.ts`.
    contextOptions: { reducedMotion: 'reduce' },
  },
  // `vite build` then `vite preview`, **not** `npm run dev` — and the build is
  // half of the fix, not a preamble to it.
  //
  // The dev server watches the whole `ui/` tree and pushes a `full-reload` down
  // the HMR socket to every open page when a watched file changes. This checkout
  // is shared, so files change *during* a run. Measured on this repo, 2026-08-18:
  // a colleague's save to `src/ui/fieldFrame.ts` reloaded a page that was
  // mid-assertion, and `every composition check has a mutant that kills it` went
  // red at two widths — the reload had wiped the mutant the test had just
  // injected, so `expectDesign` passed and the guard reported that its own
  // mutant "is no longer caught". That is the dangerous shape: a red that
  // accuses the guard rather than the tree, and the repair it invites is
  // weakening the guard. 2–5 such failures per disturbed run, never the same
  // ones twice; `Execution context was destroyed` is only its loudest form.
  //
  // Two narrower fixes were measured and rejected. `server.hmr: false` and
  // `server.watch.ignored` each do stop the reload — and each leaves the real
  // defect standing, because the dev server still compiles modules per request:
  // a file saved mid-run is served to every page that navigates after it.
  // Measured with `hmr: false`: one page in a run read `index.html` and the next
  // read a mutated one, no reload, nothing in the report saying the run had
  // graded two different trees. Both also live in vite.config.ts, which vitest
  // shares and a human's `npm run dev` reads. A loud flake traded for a quiet
  // wrong answer is the worse of the two.
  //
  // `vite build` freezes the tree once; `vite preview` serves that directory
  // with no watcher and no socket, so every test in the run grades the same
  // bytes. ~5s of build against a ~30s suite, spent inside this command, so
  // there is no rebuild step anyone can forget and no staleness to detect.
  //
  // `--outDir dist-e2e` rather than the default `dist`: a colleague's
  // `npm run build` would otherwise empty and rewrite the directory under the
  // running preview. The build does log one `page reload dist-e2e/index.html`
  // line on a dev server someone else has open; measured, no page moves — vite's
  // client drops a `full-reload` naming an .html file unless the browser is on
  // that file.
  //
  // `reuseExistingServer: false` is the other half of "cannot silently
  // regress": reuse would let a second run skip the build and grade the first
  // run's `dist-e2e`. With it off, an occupied port fails the run by name —
  // two suites started at once get an unmistakable "port already used" rather
  // than a shared snapshot. Port 4173 (preview's own default) rather than 5173,
  // so a human's `npm run dev` is neither disturbed nor silently graded.
  webServer: {
    command:
      'npx vite build --outDir dist-e2e --emptyOutDir && ' +
      'npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  // These three widths are also written in `e2e/_harness.ts` as `WIDTHS`, which
  // is what every per-breakpoint expectation is keyed by. Adding a project here
  // without adding its width there is not a silent no-op: `atWidth` throws,
  // naming the viewport, rather than letting a fourth project grade nothing.
  //
  // **Removing one is the dangerous direction, and it is asserted.** Deleting
  // `w1440` used to leave the run at 8 passed / 12 skipped with nothing failing:
  // `harness.spec.ts`'s `proved once` block is gated on `WIDTHS[0]`, so four of
  // its guards simply stopped running. `the run shape is the one §4 documents`
  // compares this list against `WIDTHS` from every project, so a missing,
  // renamed or resized one is a red rather than a quieter run.
  projects: [
    { name: 'w1440', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'w1080', use: { viewport: { width: 1080, height: 900 } } },
    { name: 'w760', use: { viewport: { width: 760, height: 900 } } },
  ],
})
