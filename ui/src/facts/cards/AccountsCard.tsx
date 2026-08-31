import { useState } from 'react'
import {
  ENVELOPE_FIELD_LABELS, SCREEN_LABELS, SOURCE_TYPE_LABELS, label,
} from '../../lib/factsLabels'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Overlay'
import { useResolveFact } from '../../api/hooks'
import { FAILED } from '../../write/ConfirmMark'
import type { FactAccount, FactBundle } from '../../api/types'
import { pathLabel } from '../bundle'
import { DetailCard, Mono, PX, Statement } from './parts'
import { sourceAt, sourceFile } from '../sourceText'

/**
 * «روایت‌های متعارض» — `Inja Panel.dc.html:1672-1690`, corrected by
 * **conformance note 4**.
 *
 * The design draws `sfAccounts` (:5031) as one flat list of every open account
 * with no grouping and no speaker, which on an entry disputed in two places
 * reads as four unrelated sentences. QF-39 says the accounts are shown *grouped
 * under the disputed field's `path_labels` label, each with `speaker_role`,
 * source and value* — so the card is one `group` per field, named by the label
 * the server composed («گرم — اینجا پیتزا — پنیر پیتزا»), and a reviewer never
 * reads `data/rows/prod_61__ing_1/grams`.
 *
 * Choosing posts `resolve`, which the ui-backend runs as `merge facts resolve`
 * under a run directory of its own; the service never edits `facts/*.json`. The
 * route answers with the whole bundle re-read, and `useResolveFact` invalidates
 * `['fact', fid]` and `['facts']` on settle, so the screen re-reads rather than
 * patching anything locally — the design's `s.factRes` override store is mock
 * state (audit §3).
 */
export function AccountsCard({ bundle }: { bundle: FactBundle }) {
  const open = (bundle.entry.accounts ?? []).filter((a) => a.status === 'open')
  const [asking, setAsking] = useState<FactAccount | undefined>(undefined)
  const resolve = useResolveFact(bundle.entry.id)
  if (open.length === 0) return null

  // One group per disputed field, in the order the accounts arrive.
  const fields = [...new Set(open.map((a) => a.field))]

  return (
    <>
      {/* Audit §2.1 — the design's 1.5px edge is a red the token set does not
          hold, and `--border-danger` is the danger family's own value (the
          audit's own row records that `--steps-group-border` carries the
          design's as a PREVIOUS value). Recorded as a deviation rather than
          minted here. */}
      <DetailCard clip={false} style={PX.accounts}
        className="mt-s10 border-hairline border-border-danger">
        <div className="text-fs-caption font-bold text-conflict mb-s1">
          {label(SCREEN_LABELS, 'heading_accounts')}
        </div>
        <div className="text-fs-caption text-muted leading-sub mb-s7">
          {label(SCREEN_LABELS, 'accounts_lede')}
        </div>
        {fields.map((field) => {
          const named = pathLabel(bundle, field)
          return (
            <section key={field} role="group" aria-label={named?.text ?? field}>
              <div className="text-fs-xs font-bold text-muted mb-s3">
                {named?.text ?? field}
              </div>
              {open.filter((a) => a.field === field).map((a) => (
                <div key={a.id}
                  className="border border-border-current rounded-tile px-s8 py-s7 mb-s5">
                  <div className="flex items-baseline gap-s5 flex-wrap mb-s5">
                    <Mono className="text-fs-h5 font-extrabold text-violet">
                      {a.value === undefined || a.value === null
                        ? label(SCREEN_LABELS, 'value_none')
                        : String(a.value)}
                    </Mono>
                    <span className="ms-auto inline-flex items-baseline gap-s3 flex-wrap">
                      {/* Note 4 — who said it. The design shows no speaker at
                          all, and on a dispute between a transcript and a cell
                          that is the whole of what settles it. */}
                      {a.speaker_role != null && a.speaker_role !== '' && (
                        <span className="text-fs-xxs text-muted">
                          {label(ENVELOPE_FIELD_LABELS, 'speaker_role')}: {a.speaker_role}
                        </span>
                      )}
                      {a.source !== undefined && (
                        <>
                          <span className="text-fs-xxs text-faint">
                            {label(SOURCE_TYPE_LABELS, a.source.type)}
                            {sourceAt(a.source) === '' ? '' : ` · ${sourceAt(a.source)}`}
                          </span>
                          <Mono className="text-fs-micro text-muted">
                            {sourceFile(a.source)}
                          </Mono>
                        </>
                      )}
                    </span>
                  </div>
                  <Statement text={a.statement}
                    className="text-fs-body-lead text-ink leading-looser text-justify
                               [text-wrap:pretty]" />
                  <Button variant="violet" className="mt-s6 px-s7 text-fs-caption"
                    onClick={() => setAsking(a)}>
                    {label(SCREEN_LABELS, 'choose_account')}
                  </Button>
                </div>
              ))}
            </section>
          )
        })}
      </DetailCard>

      {asking !== undefined && (
        <Dialog open width="xs" onClose={() => setAsking(undefined)}
          title={label(SCREEN_LABELS, 'account_dialog_title')}
          subtitle={label(SCREEN_LABELS, 'account_dialog_body')}
          alert={resolve.error ? FAILED : undefined}
          footer={
            <div className="flex gap-s5">
              <Button variant="violet" className="flex-1 px-s8 text-fs-menu"
                loading={resolve.isPending}
                onClick={() => {
                  resolve.mutate({ field: asking.field, account: asking.id },
                    { onSuccess: () => setAsking(undefined) })
                }}>
                {label(SCREEN_LABELS, 'account_dialog_ok')}
              </Button>
              <Button variant="ghost" className="flex-1 px-s8 text-fs-menu"
                onClick={() => setAsking(undefined)}>
                {label(SCREEN_LABELS, 'cancel')}
              </Button>
            </div>
          }
        >
          <p className="text-fs-sm2 text-muted leading-sub m-0">{asking.statement}</p>
        </Dialog>
      )}
    </>
  )
}
