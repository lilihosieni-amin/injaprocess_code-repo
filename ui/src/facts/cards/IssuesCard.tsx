import {
  ENVELOPE_FIELD_LABELS, FIELD_STATUS_LABELS, FIX_OP_LABELS, ISSUE_KIND_LABELS,
  SCREEN_LABELS, label,
} from '../../lib/factsLabels'
import { toFa } from '../../lib/format'
import type { FactBundle } from '../../api/types'
import { pathLabel, refTitle } from '../bundle'
import { DetailCard, HeadBand, Mono, RefLink } from './parts'

/**
 * The two halves of **conformance note 8** the design computes and never draws.
 *
 * `IssuesCard` is the design's own card (`:1695-1701`) with the three fields the
 * note adds — `from_date`, `fix` and `affects` — which `sfIssues` (:5048) drops.
 * `FieldStatusCard` is `sfFields` (:5045), computed with a label, an ink and a
 * dot per path and consumed by no node in the file; the note says to draw it.
 *
 * **Where the words come from, since the design supplies none.** «معتبر از» is
 * Appendix D's own label for a date something starts holding from, and an
 * issue's `from_date` is exactly that. A `fix` needs no label at all: Appendix D
 * gives its four ops the labels «ضرب در» / «تقسیم بر» / …, which read as
 * complete phrases in front of the factor. `affects` is drawn as the names of
 * the entries it names, which is what the field is; nothing here invents a
 * Persian word.
 */
export function IssuesCard({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const issues = bundle.entry.issues ?? []
  if (issues.length === 0) return null
  return (
    <div className="mt-s7">
      {issues.map((x, i) => (
        // Audit §2.1 — the design's body ink here is a darker olive that no
        // token holds; `--warn-fg` is the amber family's own ink and is what
        // this card's eyebrow already takes. Recorded as a deviation.
        //
        // :1698 — `16px 18px`, both on the ladder. It was `PX.head1620`, the
        // printed-rows head's `16px 20px`, borrowed by its number.
        <div key={i}
          className="px-s9 py-s8 bg-tile-warn border border-warn-edge rounded-card mb-s5">
          <div className="flex items-baseline gap-s5 flex-wrap">
            <span className="text-fs-xs font-bold text-warn-fg">
              {label(SCREEN_LABELS, 'issue_prefix')
                .replace('{kind}', label(ISSUE_KIND_LABELS, x.kind))}
            </span>
            {x.from_date !== undefined && (
              <span className="inline-flex items-baseline gap-s3">
                <span className="text-fs-xxs text-warn-fg">
                  {label(ENVELOPE_FIELD_LABELS, 'valid_from')}
                </span>
                <Mono className="text-fs-xxs text-warn-fg">{toFa(x.from_date)}</Mono>
              </span>
            )}
            {x.fix !== undefined && (
              <span className="text-fs-xxs font-bold text-warn-fg">
                {label(FIX_OP_LABELS, x.fix.op)}
                {x.fix.factor === undefined ? '' : ` ${toFa(x.fix.factor)}`}
              </span>
            )}
          </div>
          <div className="text-fs-body-lead text-warn-fg leading-looser mt-s4 text-justify
                          [text-wrap:pretty]">
            {x.description}
          </div>
          {x.affects.length > 0 && (
            <div className="flex items-baseline gap-s5 flex-wrap mt-s4">
              {x.affects.map((a) => (
                <RefLink key={a.ref} named={refTitle(bundle, a)} onOpen={onOpen}
                  className="text-fs-sm2" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The `field_status` markers — «استنباطی» / «عرفی» — one row per marked path,
 * under the label the server composed for it.
 *
 * The design draws no box for this (`sfFields` has no consuming node), so the
 * box is the screen's own plainest card and the words are Appendix D's:
 * «وضعیت فیلدها» for the heading, `FIELD_STATUS_LABELS` for the two values.
 * Only `field_status` is listed here — the design's `excRows` folds the red
 * paths in as well, and those are already drawn where they live: a disputed
 * field is the accounts card, an unanswered leaf is a red cell or a
 * «واحد ثبت نشده» pill.
 */
export function FieldStatusCard({ bundle }: { bundle: FactBundle }) {
  const marks = Object.entries(bundle.entry.field_status ?? {})
  if (marks.length === 0) return null
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{label(ENVELOPE_FIELD_LABELS, 'field_status')}</HeadBand>
      {marks.map(([path, status], i) => (
        <div key={path}
          className={`flex items-center gap-s5 px-s9 py-s6 flex-wrap
                      ${i === marks.length - 1 ? '' : 'border-b border-line-row'}`}>
          {/* F11 — the state is a word beside the dot, never a colour alone. */}
          <span aria-hidden className="w-s4 h-s4 rounded-round flex-none bg-junction-or" />
          <span className="text-fs-menu text-ink">
            {pathLabel(bundle, path)?.text ?? path}
          </span>
          <span className={`ms-auto text-fs-xs font-bold
                            ${status === 'inferred' ? 'text-violet' : 'text-warn-fg'}`}>
            {label(FIELD_STATUS_LABELS, status)}
          </span>
        </div>
      ))}
    </DetailCard>
  )
}
