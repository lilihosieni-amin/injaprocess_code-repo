import { useId } from 'react'

/**
 * §5.2 — the design gives the field three scales, and they are not densities:
 * they are where it sits. A screen-level field, a field inside a dialog, and
 * the little one inside a dropdown's popover are three different compositions,
 * and the shell cannot know which one a caller is building (F8 puts *density*
 * on the shell, and the surface still scales the type below).
 */
const PLACE = {
  screen: 'py-search-y px-search-x rounded-search',
  dialog: 'py-s6 px-search-x-dialog rounded-button',
  menu: 'py-search-y-menu ps-search-x-menu pe-s6 rounded-control',
} as const

const ICON = {
  screen: 'start-search-icon w-search-glyph h-search-glyph',
  dialog: 'start-search-icon-dialog w-s8 h-s8',
  menu: 'start-search-icon-menu w-s7 h-s7',
} as const

export function SearchField({
  label, value, onChange, placeholder, place = 'screen',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  place?: keyof typeof PLACE
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {/* F11 — bound label. The mockups use placeholders alone, which vanish on
          focus and are not announced as names. */}
      <label htmlFor={id} className="text-caption font-bold text-muted">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          // §4.3 — 1.5px --line on every control and input; §4.6 — focus is
          // border-color: --coral and nothing else, 15 declarations out of 15.
          // The type size comes from the surface (R3): 13px panel, 14.5 reader.
          className={`min-h-touch w-full border-hairline border-line bg-card text-role-dense text-ink outline-none focus:border-coral transition ${PLACE[place]}`}
        />
        {/* §8 — the magnifier is pinned to the inline start. The design writes
            it as a physical `right`, which is the same edge in an app whose
            html is direction:rtl and which never runs ltr. */}
        <svg
          aria-hidden
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-faint ${ICON[place]}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
    </div>
  )
}
