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
  // The process analyst — the only role that changes anything (PRD §2).
  editor: 'تحلیل‌گر',
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
