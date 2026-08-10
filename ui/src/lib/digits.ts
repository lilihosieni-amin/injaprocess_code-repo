const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC = '٠١٢٣٤٥٦٧٨٩'

/**
 * Folds Persian and Arabic-Indic digits to ASCII. Not optional in a
 * Persian-language interface: ordinary keyboards emit ۰۹…, and a username that
 * reaches the API unfolded is a different string from the same number typed on a
 * latin keyboard (spec D57).
 */
export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN.indexOf(ch)
    return String(p >= 0 ? p : ARABIC.indexOf(ch))
  })
}

/** Canonical Iranian mobile: `^09\d{9}$` (spec D57). */
export function normalisePhone(input: string): string {
  const digits = toLatinDigits(input).replace(/[\s\-()]/g, '')
  if (digits === '') return ''
  // Strip a country code however it was written, then any trunk zeros it was
  // prepended to, then restore exactly one. "+98 0912…" and "0912…" and
  // "+98 912…" all have to land on the same string, or one person occupies two
  // accounts (spec D57).
  const national = digits.replace(/^(?:\+98|0098|98)/, '').replace(/^0+/, '')
  return national === '' ? '' : '0' + national
}
