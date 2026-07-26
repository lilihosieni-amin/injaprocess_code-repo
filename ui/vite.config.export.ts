import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

// A second build whose output is two *self-contained* HTML documents: the JS,
// the CSS and the Vazirmatn woff2 are all inlined, so an export opens offline
// with no server (D3). `ui-backend` treats each file as a template and only
// substitutes its data slot.
//
// One entry per invocation: `viteSingleFile` sets `output.inlineDynamicImports`,
// which Rollup rejects for a multi-input build ("multiple inputs are not
// supported"), and a chunk shared between two entries could not be inlined into
// either document anyway. So `build:export` runs this config twice, once per
// document.
const ENTRIES = ['flowchart', 'steps'] as const
type Entry = (typeof ENTRIES)[number]

const isEntry = (v: string | undefined): v is Entry => ENTRIES.includes(v as Entry)

const entry = process.env.INJA_EXPORT_ENTRY
if (!isEntry(entry)) {
  throw new Error(
    `INJA_EXPORT_ENTRY must be one of ${ENTRIES.join(', ')} — got ${entry ?? '(unset)'}`,
  )
}

/** Vite names an HTML output after its path relative to the project root, so
 *  `export/flowchart.html` would land at `dist-export/export/flowchart.html`.
 *  `ui-backend` looks the template up as `<template dir>/flowchart.html`, so
 *  drop the directory. Runs after `viteSingleFile`, which is also `post`. */
function flattenHtmlOutput(): Plugin {
  return {
    name: 'inja:flatten-export-html',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (!name.endsWith('.html') || !name.includes('/')) continue
        const flat = name.slice(name.lastIndexOf('/') + 1)
        if (bundle[flat]) throw new Error(`export output collision on ${flat}`)
        const asset = bundle[name]
        delete bundle[name]
        asset.fileName = flat
        bundle[flat] = asset
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), flattenHtmlOutput()],
  build: {
    outDir: 'dist-export',
    // only the first document may clear the directory, or it would delete the other
    emptyOutDir: entry === ENTRIES[0],
    // fold every referenced asset (the font in particular) into the CSS as a
    // data: URI — singlefile inlines JS and CSS but not font files
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: { [entry]: resolve(__dirname, `export/${entry}.html`) },
    },
  },
})
