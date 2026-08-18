import { defineConfig } from '@playwright/test'

/**
 * R6 — the gate vitest cannot be. jsdom computes no layout, no colour and no
 * font metrics, so a screen can pass every unit test and still look wrong.
 *
 * `channel: 'chrome'` drives the Chrome already installed at
 * /usr/bin/google-chrome. Nothing is downloaded: the network here is
 * restricted, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set at install time.
 *
 * The target is the **dev server**, not the container on :8000. The container
 * serves a `ui/dist` built at some earlier moment, so a check pointed at it
 * would grade a snapshot rather than the working tree — precisely the drift R6
 * exists to catch. The specs stub every read endpoint (see `_harness.ts`), so
 * the dev server needs no backend behind it and nothing here depends on the
 * proxy in vite.config.ts reaching :8000.
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
    baseURL: 'http://127.0.0.1:5173',
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
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
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
