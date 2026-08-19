import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirmations, useProcess, usePutProcess } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useToast } from '../write/ToastProvider'
import { ConfirmMark, ConfirmAction } from '../write/ConfirmMark'
import type { Process, Icom, Kpi } from '../api/types'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'
import { SectionCard } from '../ui/SectionCard'
import { TextField } from '../ui/TextField'
import { toFa } from '../lib/format'
// `hasIcom` — one home for "is there a term in this A-0 block", shared with
// `DetailDrawer`. Its neighbour `hasPublishedDetail` is the OR across all three
// switchable fields, and R43 left this screen with no branch that asks it: each
// section below asks about its own field alone, and "nothing was published" is
// no longer a state, only every section declining to draw. `ProcessList` still
// asks it, to decide whether to offer a door here at all (R39) — and that the
// door and the room still agree is asserted, over all eight combinations of the
// three fields, in `Summary.test.tsx`'s «what counts as published detail».
import { hasIcom } from '../lib/published'
import { refusalStatus } from '../api/client'
import { LoadFailedScreen } from '../ui/states'
import { RefusalScreen } from './Refusal'

/**
 * The destructive square — `--tile-c2` under `--conflict` behind a 1.5px
 * `--border-danger` edge, which is `Button`'s `danger` variant's colours at the
 * size the design draws the control.
 *
 * **Not `<Button variant="danger">`**, which is what this task's own brief
 * asked for: `Button`'s BASE carries `min-h-touch min-w-touch`, and a `min-`
 * beats a `width` whatever the emitted order is, so a `w-tool h-tool` passed
 * through it paints 44×44 and the class that says 34 is never drawn. The
 * painted box stays the design's and a transparent `::before` grows the HIT
 * area to 44 — here 34 + 2×5. Byte-identical to the control
 * `src/screens/Overview.tsx` and `src/screens/ProcessList.tsx` already draw;
 * the three want lifting into `src/ui/`, which is in this task's report.
 */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        'relative before:absolute before:content-[""] before:-inset-[5px] '
        + 'inline-flex items-center justify-center flex-none w-tool h-tool '
        + 'rounded-input border-hairline border-border-danger bg-tile-c2 '
        + 'text-conflict cursor-pointer'
      }
    >
      <Icon name="trash" px={16} />
    </button>
  )
}

/**
 * The design system's `AddButton`, ledger **L-22**: `inline-flex;gap:6px;
 * 12.5px/600 --violet;1.5px dashed --line-dashed;radius --radius-control;
 * padding:6px 12px`. L-22 decides the exported control's `12.5px`/radius 10
 * over `ListEditor`'s own inline `11px`/radius 9, which is what this screen
 * used to draw.
 *
 * **No leading glyph.** The brief asks for `<Icon name="plus" …>`; `ICONS` has
 * no `plus` key and `src/ui/icons/` is not this task's to write, so the control
 * is the text alone — the same shape `src/screens/Overview.tsx` ships. A `+`
 * character would be a unicode glyph doing an icon's job, which is the very
 * thing ledger L-19 forbids and this screen is being rebuilt to stop doing.
 *
 * ~34px drawn, so it takes the same `::before` the destructive square does.
 */
function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative before:absolute before:content-[""] before:-inset-[5px] '
        + 'self-start inline-flex items-center gap-s3 py-s3 px-s6 '
        + 'rounded-control border-hairline border-dashed border-line-dashed '
        + 'bg-transparent text-violet text-fs-sm2 font-semibold cursor-pointer'
      }
    >
      {children}
    </button>
  )
}

/**
 * One ICOM face's list of terms.
 *
 * F11 — the placeholder is not the label, and neither is the column heading:
 * each row carries its own numbered label so a screen reader can tell
 * «ورودی ۲» from «ورودی ۳». The heading above the column stays, because it is
 * what a sighted reader groups the four faces by.
 */
function ListEditor({ label, row, items, onChange }: {
  label: string
  /** The singular this list's rows are numbered by — «ورودی» under «ورودی‌ها». */
  row: string
  items: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div>
      <div className="text-fs-sm2 font-semibold text-violet mb-s4">{label}</div>
      <div className="flex flex-col gap-s5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-s5">
            <TextField className="flex-1 min-w-0" ground="sub"
              label={`${row} ${toFa(i + 1)}`} value={it}
              onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} />
            <RemoveButton label={`حذف ${row} ${toFa(i + 1)}`}
              onClick={() => onChange(items.filter((_, k) => k !== i))} />
          </div>
        ))}
        <AddButton onClick={() => onChange([...items, ''])}>افزودن</AddButton>
      </div>
    </div>
  )
}

export function Summary() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: p, error, refetch } = useProcess(pid)
  const put = usePutProcess(pid)
  const toast = useToast()
  const can = useCan(useSession().data)

  type Draft = { name: string; summary: string; idef0: Icom; kpis: Kpi[] }
  const [draft, setDraft] = useState<Draft | null>(null)
  const editing = draft !== null

  // The department read **lexically off the id in the URL**, exactly as the
  // server's `storage.dept_of` (`pid.rsplit("-", 1)[0]`) does, and hoisted above
  // the early returns below so the hook order never changes between renders.
  // Not `proc.department`: that is only available after those returns, and the
  // server does not trust the stored field either — `_target_scope` gates on the
  // id it was given, before anything is loaded.
  const dept = pid.replace(/-[^-]*$/, '')
  const mayConfirm = can('confirm', `dept:${dept}`)
  const { data: marks = [] } = useConfirmations(dept, { enabled: mayConfirm })

  // A process outside this reader's scope is a 404 — and so is a tombstoned one
  // to anyone without `edit`, so a link from a heir list lands here too. Both
  // get the same screen, which is the whole point of the status being uniform.
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Ahead of the blank, and that order is the whole fix. `refusalStatus` maps
  // 403 and 404 only, so every other failure — a 500 above all — fell through to
  // `!p` and drew a page that stayed empty for ever, with nothing on it to say
  // the process had not loaded and nothing to try again with. `Users`,
  // `UserDetail` and `Visibility` each grew this branch on this branch; these
  // two screens were missed.
  if (error) {
    return <LoadFailedScreen message="اطلاعات فرآیند بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }
  // …and the in-flight blank paints the FIELD, not `--bg`. `--bg` is the warm
  // cream this app never paints a screen on and the shell behind this is
  // `--ink`; `background-color` does
  // not inherit, which is the very reason every rebuilt `[data-screen]` repeats
  // `bg-ink`. Measured in Chrome: a full-viewport cream flash on every first
  // navigation to this screen, invisible to every test by construction — jsdom
  // paints nothing and every e2e stubs the read so the window never opens.
  if (!p) return <div className="flex-1 bg-ink" />

  const proc: Process = p
  const mark = marks.find((m) => m.target === proc.id)
  const tombstoned = !!proc.tombstoned
  // Cosmetic only: PUT /api/processes/{pid} re-derives `edit` from the session
  // row and refuses regardless. Asked about the process's own department, which
  // is the department the endpoint gates on too.
  //
  // **It is also the disclosure predicate, and that is not a coincidence.**
  // `disclosure.redact` passes `editor=self.edits(dept)` — `_may_edit(f"dept:
  // {dept}")` — into `visibility.filtered`, which returns the document untouched
  // for an editor and blanks `summary`, `idef0` and `kpis` for everybody else.
  // So this one boolean is the line between "this field arrived empty because it
  // IS empty" and "this field arrived empty and I cannot tell which". Nothing
  // below may claim absence on the false side of it (NFR-12 / AC-25). The
  // premise this file used to carry — *"the app is never told which way the
  // switch is set"* — is true of the switch and false of the only question that
  // decides what may be said about it.
  const mayEdit = can('edit', `dept:${proc.department}`)
  function enter() {
    if (tombstoned) return
    setDraft({ name: proc.name, summary: proc.summary, idef0: { ...proc.idef0 }, kpis: proc.kpis.map((k) => ({ ...k })) })
  }
  function save() {
    const doc: Process = { ...proc, name: draft!.name, summary: draft!.summary, idef0: draft!.idef0, kpis: draft!.kpis }
    put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات فرآیند ذخیره شد') } })
  }
  const setIcom = (key: keyof Icom, items: string[]) => setDraft((d) => d && ({ ...d, idef0: { ...d.idef0, [key]: items } }))
  const setKpi = (i: number, p2: Partial<Kpi>) => setDraft((d) => d && ({ ...d, kpis: d.kpis.map((k, k2) => (k2 === i ? { ...k, ...p2 } : k)) }))

  return (
    // §6.0 — the shell owns the violet field, and this root repaints it because
    // the gate reads `background-color` off THIS element with `getComputedStyle`,
    // which does not inherit: a root that painted nothing would compute
    // `rgba(0, 0, 0, 0)` however violet the shell behind it is. §8's scroll box
    // is `data-r-pad`, whose two `direction` rules live in `src/styles/base.css`.
    <div data-screen="summary" data-r-pad
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-summary mx-auto">
        <div data-r-stack className="flex items-start justify-between gap-s8 mb-s10">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-s5 mb-s4">
              <IdBadge tone="violet">{proc.id}</IdBadge>
              {proc.parent && <span className="text-fs-xxs font-semibold text-violet bg-tile-v px-s5 py-s1 rounded-badge">زیرفرآیند</span>}
              {/* The design draws one status pill here under `isEditor`.
                  `ConfirmMark` IS that pill — it renders a `StatusPill` of its
                  own — so a second one beside it would put «تأیید شده» on the
                  screen twice and say nothing new. */}
              <ConfirmMark row={mark} department={dept} />
            </div>
            {tombstoned && (
              <div className="mb-s6 rounded-button border border-border-dead bg-tile-dead px-s8 py-s6 text-fs-sm text-muted">
                <div className="font-bold text-ink mb-s1">این فرآیند باطل شده است.</div>
                {(proc.superseded_by ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-s4 items-center">
                    <span>جانشین:</span>
                    {(proc.superseded_by ?? []).map((h) => (
                      <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!editing && (
              <>
                {/* Ledger L-02: the deliverable draws 23px here and 22px on
                    seven other screens; 22 wins for all nine. L-01: a title on
                    the field is white (`--role-title-on-field`), not the cream
                    `--text-on-dark` that L-01 retired. */}
                <h1 data-h1 className="font-extrabold text-fs-h2 text-role-title-on-field m-0">{proc.name}</h1>
                {proc.summary.trim() !== '' && (
                  <p data-body className="text-fs-lg text-role-subtitle-on-field mt-s4 leading-relaxed m-0">{proc.summary}</p>
                )}
              </>
            )}
          </div>
          <div data-r-actions className="flex items-center gap-s5 shrink-0 max760:flex-wrap">
            {!editing ? (
              <>
                {/* §6.3 — the act belongs in the header's action group, not in
                    the badge row beside the mark. `ConfirmMark` is a 22px pill
                    and this is a 44px control; putting them on one line is
                    what set the height of every process row (F1). */}
                <ConfirmAction row={mark} department={dept} />
                {mayEdit && !tombstoned && (
                  <Button variant="ghost" onClick={enter} className="px-s8 py-s6 text-fs-sm">ویرایش اطلاعات</Button>
                )}
                {/* Ledger P3-3 — violet primary, matching the row's own pairing. */}
                <Button variant="violet" onClick={() => nav(`/processes/${proc.id}/flow`)}
                  className="px-s8 py-s6 text-fs-sm">مشاهدهٔ فلوچارت</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setDraft(null)} className="px-s8 py-s6 text-fs-sm">انصراف</Button>
                <Button variant="green" onClick={save} loading={put.isPending} loadingLabel="در حال ذخیره…"
                  className="px-s8 py-s6 text-fs-sm">ذخیره</Button>
              </>
            )}
          </div>
        </div>

        {!editing ? (
          /* **Owner ruling R43 — where a switchable field was withheld, a
             non-editor sees NOTHING.** No card, no heading, and no sentence
             saying so: the section is simply not on the page.

             **This reverses part of Task 16, deliberately.** §6.3 says a
             non-editor gets *a stated limit, not a blank*, and Task 16
             implemented it — «خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند»
             over a paragraph about the policy, plus a per-field line inside each
             section. The owner was shown that reading beside the deliverable's
             and chose the deliverable's, under a rule they gave in their own
             words: *"if user couldn't see anything, we shouldn't see anything
             about it. like design."* A sentence naming three withheld sections
             is itself the disclosure they are removing. §6.3 still reads the
             other way; a later reader who finds that clause and no stated limit
             here is looking at a DECISION, not a regression.

             The deliverable says it structurally rather than in prose.
             `ui/design/Inja Panel.dc.html` opens `<sc-if value="{{ isEditor }}">`
             at :409 and does not close it until :463, so the A-0 card (:410),
             its heading (:412), the KPI heading (:446) and both KPI states
             (:447, :460) are all inside one editor guard. What is left for
             everyone else is the header — which is why the guards below are per
             SECTION and the screen itself is never withheld.

             **The three switches stay independent.** `visibility.py` maps
             summary→process_summary, idef0→process_idef0, kpis→process_kpis and
             `/visibility` sets each separately, so the ordinary case is one of
             them off. An OR across the three — one withheld field taking the
             other two sections down with it — was a real defect; each guard here
             reads its own field and nothing else. */
          <>
            {(mayEdit || hasIcom(proc.idef0)) && (
              <div data-card className="bg-card border border-border-card rounded-doc p-s11 mb-s9 shadow-card">
                <div className="font-bold text-fs-body text-violet mb-s9 flex items-center gap-s4">
                  <span className="w-s4 h-s4 bg-coral rounded-round" />نمای IDEF0 سطح فرآیند (A-0)
                </div>
                {/* An editor keeps the empty frame — it is theirs to fill, and
                    `visibility.filtered` withheld nothing from them. A
                    non-editor is only ever here with terms to draw, because
                    four labelled columns with no chips would be a claim of
                    absence made in pictures. */}
                <div data-r-idef0 className="grid grid-cols-idef0 gap-s7 items-center max760:flex max760:flex-col max760:gap-s6">
                  <div className="col-start-2 row-start-1 text-center min-w-0">
                    <div className="text-fs-xxs text-muted mb-s3">کنترل‌ها ↓</div>
                    <div className="flex flex-wrap gap-s3 justify-center">{proc.idef0.controls.map((t, i) => <Chip key={i} kind="control">{t}</Chip>)}</div>
                  </div>
                  <div className="col-start-3 row-start-2 text-center min-w-0">
                    <div className="text-fs-xxs text-muted mb-s3">ورودی‌ها →</div>
                    <div className="flex flex-col gap-s3 items-center">{proc.idef0.inputs.map((t, i) => <Chip key={i} kind="input">{t}</Chip>)}</div>
                  </div>
                  <div className="col-start-2 row-start-2 bg-violet rounded-tile px-s8 py-s10 text-center text-card shadow-violet">
                    <div className="font-bold text-fs-lg">{proc.name}</div>
                    {/* §8 — every mono id run is an LTR island. Declared in
                        `src/test/guards.test.ts`'s ISLANDS beside the others. */}
                    <div dir="ltr" className="font-mono text-fs-xxs text-violet-on-violet mt-s3">A-0 · {proc.id}</div>
                  </div>
                  <div className="col-start-1 row-start-2 text-center min-w-0">
                    <div className="text-fs-xxs text-muted mb-s3">← خروجی‌ها</div>
                    <div className="flex flex-col gap-s3 items-center">{proc.idef0.outputs.map((t, i) => <Chip key={i} kind="output">{t}</Chip>)}</div>
                  </div>
                  <div className="col-start-2 row-start-3 text-center min-w-0">
                    <div className="flex flex-wrap gap-s3 justify-center">{proc.idef0.mechanisms.map((t, i) => <Chip key={i} kind="mech">{t}</Chip>)}</div>
                    <div className="text-fs-xxs text-muted mt-s3">↑ مکانیزم‌ها</div>
                  </div>
                </div>
              </div>
            )}

            {(mayEdit || proc.kpis.length > 0) && (
              <>
                {/* Ledger P3-2: §6.3 gives this heading `--ink`, which is the
                    very colour of the field it is written on — contrast 1.00.
                    §6.0 settles it: headings on the field are white. */}
                <h2 className="font-bold text-fs-lg text-role-title-on-field mb-s6 m-0">شاخص‌های کلیدی عملکرد (KPI)</h2>
                {proc.kpis.length > 0 ? (
                  <div data-r-2col className="grid grid-cols-2 gap-s7 max760:grid-cols-1">
                    {proc.kpis.map((k, i) => (
                      <div key={i} className="bg-card border border-border-card rounded-tile px-s9 py-s8">
                        <div className="flex items-center justify-between gap-s4">
                          <div className="font-bold text-fs-body text-ink">{k.name}</div>
                          {k.target && <div className="text-fs-sm2 font-bold text-conflict bg-tile-c px-s5 py-s1 rounded-badge">{k.target}</div>}
                        </div>
                        <p className="text-fs-sm2 text-muted mt-s4 leading-relaxed m-0">{k.definition}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-card border border-dashed border-line rounded-tile p-s9 text-center text-faint text-fs-sm2 leading-loose">
                    {/* Reachable only for an editor — the guard above is the
                        other half of it — and that is what licenses the
                        sentence. «ثبت نشده است» claims nobody recorded a KPI,
                        which is knowable only for the caller
                        `visibility.filtered` hands the document to untouched.
                        For everyone else an empty list is indistinguishable
                        from a withheld one, and under R43 the screen answers
                        that by saying nothing at all rather than by saying so.
                        The deliverable draws this state at :460, inside the
                        same `isEditor` guard. */}
                    شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی جلسه پر می‌شود.)
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* The deliverable draws no edit form for this screen — its own
                «ویرایش اطلاعات» is bound to `notImpl` — so the form is the
                app's, built out of §5.2's sub-panel and the shared field. The
                fields sit on a sub-panel rather than straight on the violet
                field because `FIELD_LABEL` is `--violet` type, which on
                `--ink` is unreadable. */}
            <SectionCard skin="tint" eyebrow="اطلاعات فرآیند" className="mb-s9">
              <div className="flex flex-col gap-s6">
                <TextField label="نام فرآیند" ground="sub" value={draft!.name}
                  onChange={(v) => setDraft({ ...draft!, name: v })} />
                <TextField label="خلاصهٔ فرآیند" multiline rows={2} ground="sub" value={draft!.summary}
                  onChange={(v) => setDraft({ ...draft!, summary: v })} />
              </div>
            </SectionCard>

            <SectionCard skin="tint" eyebrow="نمای IDEF0" className="mb-s9">
              <div data-r-2col className="grid grid-cols-2 gap-s9 max760:grid-cols-1">
                <ListEditor label="ورودی‌ها" row="ورودی" items={draft!.idef0.inputs} onChange={(v) => setIcom('inputs', v)} />
                <ListEditor label="کنترل‌ها" row="کنترل" items={draft!.idef0.controls} onChange={(v) => setIcom('controls', v)} />
                <ListEditor label="خروجی‌ها" row="خروجی" items={draft!.idef0.outputs} onChange={(v) => setIcom('outputs', v)} />
                <ListEditor label="مکانیزم‌ها" row="مکانیزم" items={draft!.idef0.mechanisms} onChange={(v) => setIcom('mechanisms', v)} />
              </div>
            </SectionCard>

            <SectionCard skin="tint" eyebrow="شاخص‌های کلیدی عملکرد (KPI)">
              <div className="flex flex-col gap-s6">
                {draft!.kpis.map((k, i) => (
                  <div key={i} className="flex items-start gap-s5">
                    <div className="flex-1 min-w-0 flex flex-col gap-s5">
                      <TextField label={`نام شاخص ${toFa(i + 1)}`} ground="sub" value={k.name}
                        onChange={(v) => setKpi(i, { name: v })} />
                      <TextField label={`تعریف شاخص ${toFa(i + 1)}`} ground="sub" value={k.definition ?? ''}
                        onChange={(v) => setKpi(i, { definition: v })} />
                      <TextField label={`مقدار هدف ${toFa(i + 1)}`} ground="sub" value={k.target ?? ''}
                        onChange={(v) => setKpi(i, { target: v })} />
                    </div>
                    <RemoveButton label={`حذف شاخص ${toFa(i + 1)}`}
                      onClick={() => setDraft({ ...draft!, kpis: draft!.kpis.filter((_, k2) => k2 !== i) })} />
                  </div>
                ))}
                <AddButton onClick={() => setDraft({ ...draft!, kpis: [...draft!.kpis, { name: '' }] })}>افزودن شاخص</AddButton>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}
