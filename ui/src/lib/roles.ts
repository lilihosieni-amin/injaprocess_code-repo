/**
 * What a role is called on screen.
 *
 * The stored name is an identifier — `reader_no_download` — and it is what every
 * check is decided from (`seed.ROLES`, `/api/roles`, the role `<select>`'s
 * value). This is the presentation of one, and nothing decides anything from its
 * output.
 *
 * It exists because the identifier was reaching the screen raw. The sharpest
 * instance was `/profile`, the one screen every account reaches: a floor
 * staffer with no English saw `reader_no_download` printed beside their own
 * name, on a page whose whole remaining text is Persian.
 *
 * **A role this build has no wording for keeps its identifier.** Roles are
 * seeded and written nowhere (D50), so a name that is not below is a role added
 * on the server ahead of the UI — and «—», or a blank, would tell an
 * administrator the account has no role at all, which is a different and false
 * fact. Quoted is legible; erased is a lie.
 */
const ROLE_LABELS: Record<string, string> = {
  // The process analyst — the only role that changes anything (PRD §2). Owner
  // ruling: «ادیتور» everywhere, which is the word both deliverables use for
  // this role in their own prose (`Inja Panel.dc.html:405`) and the word the
  // owner uses for it. «تحلیل‌گر» was this file's invention.
  editor: 'ادیتور',
  // Sees everything, manages users, reads the activity reports, edits nothing.
  admin: 'مدیر',
  reader: 'خواننده',
  // FR-E7: may read and comment, may take no export away with them. The wording
  // names what is withheld, because that is the whole reason this role exists.
  reader_no_download: 'خواننده بدون خروجی',
}

/** What is shown where an account has no role row at all. `_user` answers `null`
 *  there — unreachable under a `NOT NULL REFERENCES` column, and reported rather
 *  than 500'd, so a screen still has to draw something. */
export const NO_ROLE_NAME = '—'

export function roleLabel(role: string | null | undefined): string {
  if (role === null || role === undefined || role === '') return NO_ROLE_NAME
  return ROLE_LABELS[role] ?? role
}

/**
 * The three fg/bg pairs S1's script declares for the users table (§1.2, script
 * 991–992): `editor` takes the coral tile under `--conflict`, `admin` the
 * violet icon tile under `--violet`, and every reader the lighter violet tile
 * under the same `--violet`. Written as token-backed utility pairs — the values
 * themselves live in `design/_ds/…/tokens/colors.css` and nowhere else — so no
 * literal reaches a screen and none is repeated here either (F6 scans this
 * file, comments included).
 *
 * **The design declares the pair and draws only half of it.** `Inja Panel.dc.html`
 * binds both `roleBg` and `roleFg` on every user row and the table's own
 * `<span data-r-trole>` paints the foreground alone, so the backgrounds are
 * declared and rendered nowhere. F52 is the reason to draw them: the role is
 * what an administrator scans this list for and coloured text at 12.5px is the
 * least distinct thing on the row. Reported rather than assumed — see the task
 * report's ledger row.
 *
 * A role seeded ahead of this build gets the reader pair rather than nothing:
 * an unstyled word in a column of pills reads as a rendering fault, and the
 * label beside it (`roleLabel`) already carries the unknown identifier.
 */
export const ROLE_TONE: Record<string, string> = {
  editor: 'bg-tile-c text-conflict',
  admin: 'bg-tile-v text-violet',
  reader: 'bg-tile-v2 text-violet',
  reader_no_download: 'bg-tile-v2 text-violet',
}

export function roleTone(role: string | null | undefined): string {
  return (role && ROLE_TONE[role]) || 'bg-tile-v2 text-violet'
}
