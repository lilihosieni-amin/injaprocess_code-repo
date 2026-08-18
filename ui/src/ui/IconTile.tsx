import { Icon } from './Icon'
import { useSurface } from './surface'
import { deptMeta } from '../lib/departments'
import type { IconName } from './icons'

// §5.1.2 — four accents, and colour here is meaning: each of the nine
// departments is fixed violet or coral and is never re-assigned (§1.1). `warn`
// and `ok` are for the non-department tiles that take the same box.
const ACCENT = {
  violet: 'bg-tile-v text-violet',
  coral: 'bg-tile-c text-conflict',
  warn: 'bg-tile-warn text-warn',
  ok: 'bg-tile-ok text-green',
} as const

/**
 * The glyph tile: a square of tinted surface with a line icon centred in it.
 *
 * **R3 decided all three of its numbers before this component existed, and it
 * writes none of them.** src/styles/roles.css declares the tile as a role
 * trio — `--role-tile` (48px panel / 54px reader), `--role-tile-radius`
 * (14 / 16) and `--role-tile-glyph` (24 / 26, and the 26 is §6.17's stated
 * number rather than the 27 the "half the tile" rule would derive). Writing 48
 * and 54 into this file would be a second, silent record of a scale the
 * stylesheet already owns — the same defect as src/screens/Departments.tsx
 * hard-coding the two numeral tints, which `deptMeta().numeralClass` now ends.
 *
 * So the BOX is `w-tile h-tile`, which is `var(--role-tile)`: one class, both
 * surfaces, no branch, and nothing here has to know which surface it is in.
 * The radius and the glyph get a branch only because the theme names the two
 * ENDS of each (`rounded-tile`/`rounded-card`, `w-glyph`/`w-glyph-reader`) and
 * has no utility for the role itself — see the report's ledger note. Branching
 * between two named ends is what src/ui/Dropdown.tsx, Checkbox.tsx and Radio.tsx
 * already do for their per-surface type step; writing the pixel value is what
 * none of them does.
 *
 * `px` is the escape hatch for a tile the role does not cover — §6.15's 42×42
 * confirm-dialog tile is the first — and it is the ONLY path that writes a
 * number. It replaces the role box rather than sitting beside it: an inline
 * width beats a class unconditionally, so a tile carrying both would name
 * `--role-tile` and ignore it.
 */
export function IconTile({
  dept, name, d, accent, px, className = '',
}: {
  dept?: string
  name?: IconName
  d?: string
  accent?: keyof typeof ACCENT
  px?: number
  className?: string
}) {
  const reader = useSurface() === 'reader'
  const meta = dept !== undefined ? deptMeta(dept) : undefined
  const tone = ACCENT[accent ?? meta?.accent ?? 'violet']
  const radius = reader ? 'rounded-card' : 'rounded-tile'
  const box = px === undefined ? 'w-tile h-tile' : ''
  // §5.1.2's rule is `Math.round(size/2)`, and the theme has already applied it
  // to both ends of the role — 24 on the 48px tile, and §6.17's stated 26 on the
  // 54px one. Only an overridden box has to derive it here.
  const glyph = px === undefined
    ? (reader ? 'w-glyph-reader h-glyph-reader' : 'w-glyph h-glyph')
    : undefined
  return (
    <span
      data-tile
      className={
        `inline-flex items-center justify-center flex-none ${box} ${radius} ${tone} ${className}`
          .replace(/\s+/g, ' ').trim()
      }
      style={px === undefined ? undefined : { width: px, height: px }}
    >
      <Icon
        name={name}
        d={d ?? meta?.icon}
        px={px === undefined ? undefined : Math.round(px / 2)}
        stroke={1.9}
        className={glyph}
      />
    </span>
  )
}
