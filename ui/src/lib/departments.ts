type Accent = 'violet' | 'coral'
interface Meta { icon: string; accent: Accent }

// Verbatim from the prototype buildData() DEPTS (t:'v'→violet, t:'c'→coral).
const META: Record<string, Meta> = {
  management:  { accent: 'violet', icon: 'M4 21V5l8-2v18M12 21V9l6 2v10M8 8h.01M8 12h.01M8 16h.01' },
  accounting:  { accent: 'coral',  icon: 'M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 8h6M9 12h6' },
  warehouse:   { accent: 'violet', icon: 'M3 8l9-4 9 4v8l-9 4-9-4V8zM3 8l9 4 9-4M12 12v9' },
  procurement: { accent: 'coral',  icon: 'M3 4h2l2 12h11l2-8H6M9 20a1 1 0 1 0 .01 0M17 20a1 1 0 1 0 .01 0' },
  cooking:     { accent: 'coral',  icon: 'M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1 1 1.5 2 1.5-1-2 0-4 1-6.5z' },
  preparation: { accent: 'violet', icon: 'M4 20l7-7M14 4l4 4-8 8-3-1 1-3z' },
  dining:      { accent: 'coral',  icon: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9' },
  cashier:     { accent: 'violet', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  logistics:   { accent: 'coral',  icon: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18a1.5 1.5 0 1 0 .01 0M18 18a1.5 1.5 0 1 0 .01 0' },
}

export const DEPT_CODES = Object.keys(META)

const TILE: Record<Accent, string> = {
  violet: 'bg-tile-v text-violet',
  coral: 'bg-tile-c text-conflict',
}

export function deptMeta(code: string): { icon: string; accent: Accent; tileClass: string } {
  const m = META[code] ?? { accent: 'violet', icon: '' }
  return { ...m, tileClass: TILE[m.accent] }
}
