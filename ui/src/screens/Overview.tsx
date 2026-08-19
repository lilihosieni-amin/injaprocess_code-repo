import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useConfirmations, useOverview, usePutOverview } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { jalali, toFa } from '../lib/format'
import { Accordion } from '../ui/Accordion'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { IconTile } from '../ui/IconTile'
import { TextField } from '../ui/TextField'
import { useToast } from '../write/ToastProvider'
import { ConfirmMark } from '../write/ConfirmMark'
import { refusalStatus } from '../api/client'
import { RefusalScreen } from './Refusal'
import type { Overview as OverviewT } from '../api/types'

type Draft = {
  description: string
  sub_units: { name: string; description: string }[]
  personnel: { role: string; duties: string[]; kpi: string[] }[]
}
type ArrayKey = { [K in keyof Draft]: Draft[K] extends unknown[] ? K : never }[keyof Draft]

/**
 * The department page — `Inja Panel.dc.html:466`, §6.4.
 *
 * Three stacked white cards on the violet field: the description, the
 * sub-units in a two-track grid, and the roles as a disclosure. Panel only —
 * the reader deliverable draws no department summary, so nothing here branches
 * on `useSurface()` and there is no `overviewReader` row in the harness.
 *
 * **The roles section is `ui/Accordion`, not a copy of it.** This screen used to
 * hand-roll the whole control — a button, `aria-expanded`, a rotating chevron
 * and a second «بستن» button inside the open body — while the primitive sat
 * beside it with no consumers at all. The primitive now has §6.4's anatomy and
 * this screen is its first caller; the second close button is gone with the
 * copy, because an item with two ways to close gives a screen reader a control
 * with no stated relationship to the region it closes.
 *
 * **`updated_at` is unguarded on purpose.** `visibility.public_overview` returns
 * the department page unchanged for both stances (D55) — the field is required
 * by `overview.schema.json` and arrives for every reader — so a guard here
 * would be dead code standing in for a case the server cannot produce. It is
 * the process's own timestamps that are dropped, and nothing renders those.
 *
 * §6.4 also draws a padlock line under the roles when policy withholds the KPI
 * block (`diKpiHidden`). It is **not built**, for the same reason: D55 returns
 * the overview unchanged for both stances and the schema marks `kpi` required,
 * so a withheld-KPI case cannot arrive here and an empty list really is empty.
 */
export function Overview() {
  const { code = '' } = useParams()
  const { data, error } = useOverview(code)
  const put = usePutOverview(code)
  const toast = useToast()
  // Cosmetic only: PUT /api/departments/{code}/overview re-derives `edit` from
  // the session row and refuses regardless of what is drawn here.
  const can = useCan(useSession().data)
  const mayEdit = can('edit', `dept:${code}`)
  // The overview is a confirmable target in its own right — `dining` names the
  // department document the same way `dining-001` names a process — so the
  // listing this reads is the same one the process list reads, keyed on the
  // department, and the row for the page itself is the one keyed on `code`.
  const mayConfirm = can('confirm', `dept:${code}`)
  const { data: marks = [] } = useConfirmations(code, { enabled: mayConfirm })
  const [draft, setDraft] = useState<Draft | null>(null)
  // A department outside this person's scope is a 404, never a "you may not see
  // this" — the screen must not say which of the two it is.
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  if (!data) return <div className="flex-1 bg-bg" />

  function enter() {
    setDraft({
      description: data!.description,
      sub_units: data!.sub_units.map((s) => ({ ...s })),
      personnel: data!.personnel.map((p) => ({ role: p.role, duties: [...p.duties], kpi: [...p.kpi] })),
    })
  }
  function save() {
    const d = draft!
    const doc: OverviewT = {
      ...data!,
      description: d.description.trim(),
      sub_units: d.sub_units,
      personnel: d.personnel.map((p) => ({
        role: p.role,
        duties: p.duties.map((x) => x.trim()).filter(Boolean),
        kpi: p.kpi.map((x) => x.trim()).filter(Boolean),
      })),
    }
    put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات دپارتمان ذخیره شد') } })
  }
  const editing = draft !== null

  return (
    // §6.0 — the shell owns the violet field and this root repaints it, because
    // the browser gate reads `background-color` off THIS element with
    // `getComputedStyle`, which does not inherit: a root that painted nothing
    // would compute a fully transparent value however violet the shell
    // behind it is.
    <div
      data-screen="overview"
      data-r-pad
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9"
    >
      {/* Ledger L-07 — 920px (`--width-list`), not §6.4's 900: 900 has no token,
          no role and no second use, and `--role-column` resolves to
          `--width-list`, so the theme cannot express it. */}
      <div data-col className="max-w-list mx-auto">
        <div data-r-stack className="flex items-start justify-between gap-s8 mb-s10">
          <div className="flex items-center gap-s6">
            <IconTile dept={code} />
            <div>
              <div className="flex items-center gap-s5">
                {/* `text-role-title-on-field`, never `text-on-dark`: that
                    token is the cream ledger L-01 retired for this role. No
                    hex is spelled in this file, in code OR in a comment — the
                    F6 scan reads both, and Tailwind's own scanner does not
                    read a comment differently from code. */}
                <h1 data-h1 className="font-extrabold text-fs-h2 text-role-title-on-field">
                  خلاصهٔ {data.name}
                </h1>
                {/* `mark`, not `m`: two different one-letter names in one JSX
                    block is a rename waiting to go to the wrong one. */}
                <ConfirmMark row={marks.find((mark) => mark.target === code)} department={code} />
              </div>
              <p data-body className="mt-s4 text-fs-sm text-role-subtitle-on-field leading-normal">
                آخرین به‌روزرسانی: {jalali(data.updated_at)}
              </p>
            </div>
          </div>
          {!editing ? (
            // R5 — an editor's control is ABSENT for everyone else, never drawn
            // and disabled.
            mayEdit && (
              <Button variant="violet" onClick={enter} className="flex-none px-s8 py-s5 text-fs-sm">ویرایش</Button>
            )
          ) : (
            <div className="flex flex-none gap-s5">
              <Button variant="ghost" onClick={() => setDraft(null)} className="px-s8 py-s5 text-fs-sm">انصراف</Button>
              <Button variant="green" onClick={save} loading={put.isPending} loadingLabel="در حال ذخیره…"
                className="px-s8 py-s5 text-fs-sm">ذخیره</Button>
            </div>
          )}
        </div>

        {/* The first of the three cards, and the one the browser gate measures:
            it grades `.first()`, and three identical hooks would say the same
            thing three times. */}
        <Section data-card eyebrow="شرح دپارتمان">
          {!editing ? (
            data.description.trim() ? (
              // `[text-wrap:pretty]` is an arbitrary PROPERTY, which no guard
              // forbids and no token can express. The 2.05 leading is ledger
              // L-17's long-form prose role, which is `--lh-loose` 1.9.
              <p className="text-fs-body text-ink leading-loose text-justify [text-wrap:pretty] whitespace-pre-line">
                {data.description}
              </p>
            ) : <Blank>شرحی ثبت نشده است.</Blank>
          ) : (
            <TextField label="متن شرح" multiline rows={5}
              value={draft!.description}
              onChange={(v) => setDraft({ ...draft!, description: v })}
              placeholder="شرح کوتاه دپارتمان (یک تا دو پاراگراف)" />
          )}
        </Section>

        <Section
          eyebrow={`زیربخش‌ها (${toFa(editing ? draft!.sub_units.length : data.sub_units.length)})`}
          eyebrowGap="wide"
        >
          {!editing ? (
            data.sub_units.length === 0 ? <Blank>واحدی ثبت نشده است.</Blank> : (
              // §6.4's `grid-template-columns:repeat(2,1fr);gap:12px`, collapsed
              // to one track at ≤760 by §6.16. The harness row names this
              // selector itself, so there is no `data-grid` here.
              <div data-r-2col className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
                {data.sub_units.map((s, i) => (
                  // `padding:14px 15px` — the 15 normalised to the ladder's 14
                  // (see the report; the three tokens holding 15px each forbid
                  // being borrowed).
                  <div key={i} className="self-start bg-surface-sub border border-border-current rounded-tile p-s7">
                    <div className="text-fs-menu font-bold text-ink">{s.name}</div>
                    {/* `margin-top:7px` normalised to the ladder's 8. */}
                    <p className="mt-s4 text-fs-sm2 text-body-ink leading-loose text-justify [text-wrap:pretty]">
                      {s.description}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-s6">
              {draft!.sub_units.map((s, i) => (
                <div key={i} className="flex items-start gap-s6 bg-surface-sub border border-border-current rounded-tile p-s7">
                  <div className="flex-1 min-w-0 flex flex-col gap-s5">
                    <TextField label="نام واحد" ground="sub" value={s.name}
                      onChange={(v) => patch('sub_units', i, { name: v })} placeholder="نام واحد" />
                    <TextField label="شرح واحد" multiline rows={2} value={s.description}
                      onChange={(v) => patch('sub_units', i, { description: v })} placeholder="شرح واحد" />
                  </div>
                  <RemoveButton label="حذف واحد" onClick={() => del('sub_units', i)} />
                </div>
              ))}
              <AddButton onClick={() => setDraft({ ...draft!, sub_units: [...draft!.sub_units, { name: '', description: '' }] })}>
                افزودن زیربخش
              </AddButton>
            </div>
          )}
        </Section>

        <Section eyebrow="نقش‌ها و شرح وظایف" eyebrowGap="wide">
          {!editing ? (
            data.personnel.length === 0 ? <Blank>پرسنلی ثبت نشده است.</Blank> : (
              <Accordion items={data.personnel.map((pr, i) => ({
                key: String(i),
                title: pr.role,
                badge: `${toFa(pr.duties.length)} وظیفه`,
                body: (
                  <>
                    <div className="mb-s5 text-fs-xxs font-bold text-faint">شرح وظایف</div>
                    {/* `gap:9px` normalised to the ladder's 8. Preflight already
                        clears the list's own margin, padding and marker. */}
                    <ol className="flex flex-col gap-s4">
                      {pr.duties.map((d, j) => (
                        <li key={j} className="flex items-start gap-s5">
                          {/* §6.4's `20x20` tile. 20 sits exactly between the
                              ladder's 18 and 22; the report asks for its own
                              token. */}
                          <span className="flex-none w-s10 h-s10 mt-half rounded-badge bg-tile-v text-violet text-fs-micro font-bold flex items-center justify-center">
                            {toFa(j + 1)}
                          </span>
                          <span className="flex-1 text-fs-menu text-body-ink leading-loose text-justify [text-wrap:pretty]">
                            {d}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {pr.kpi.length > 0 ? (
                      <div className="mt-s9 pt-s7 border-t border-hair">
                        <div className="mb-s5 text-fs-xxs font-bold text-faint">
                          شاخص‌های عملکرد ({toFa(pr.kpi.length)})
                        </div>
                        <div className="flex flex-col gap-s4">
                          {pr.kpi.map((k, j) => (
                            <div key={j} className="flex items-start gap-s4 text-fs-sm text-body-ink leading-loose [text-wrap:pretty]">
                              <Icon name="check" px={14} stroke={2.6} className="flex-none mt-s1 text-green" />
                              {k}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-s9 pt-s7 border-t border-hair text-fs-sm2 text-faint">شاخصی ثبت نشده است.</p>
                    )}
                  </>
                ),
              }))} />
            )
          ) : (
            <div className="flex flex-col gap-s6">
              {draft!.personnel.map((pr, i) => (
                <div key={i} className="bg-surface-sub border border-border-current rounded-tile p-s7">
                  <div className="flex items-start gap-s6">
                    <TextField className="flex-1 min-w-0" label="عنوان شغلی" ground="sub" value={pr.role}
                      onChange={(v) => patch('personnel', i, { role: v })} placeholder="عنوان شغلی" />
                    <RemoveButton label="حذف نفر" onClick={() => del('personnel', i)} />
                  </div>
                  <RowList
                    title="شرح وظایف" label="وظیفهٔ" placeholder="شرح وظیفه…"
                    removeLabel="حذف وظیفه" addLabel="افزودن وظیفه"
                    items={pr.duties}
                    onChange={(next) => patchList(i, 'duties', next)}
                  />
                  <RowList
                    title="شاخص‌های عملکرد" label="شاخص" placeholder="شرح شاخص…"
                    removeLabel="حذف شاخص" addLabel="افزودن شاخص"
                    items={pr.kpi}
                    onChange={(next) => patchList(i, 'kpi', next)}
                  />
                </div>
              ))}
              <AddButton onClick={() => setDraft({ ...draft!, personnel: [...draft!.personnel, { role: '', duties: [], kpi: [] }] })}>
                افزودن نقش
              </AddButton>
            </div>
          )}
        </Section>
      </div>
    </div>
  )

  function patch<K extends ArrayKey>(key: K, i: number, p: Partial<Draft[K][number]>) {
    setDraft((d) => d && ({ ...d, [key]: d[key].map((row, k) => (k === i ? { ...row, ...p } : row)) }))
  }
  function del<K extends ArrayKey>(key: K, i: number) {
    setDraft((d) => d && ({ ...d, [key]: d[key].filter((_, k) => k !== i) }))
  }
  function patchList(i: number, field: 'duties' | 'kpi', next: string[]) {
    setDraft((d) => d && ({
      ...d,
      personnel: d.personnel.map((p, k) => (k === i ? { ...p, [field]: next } : p)),
    }))
  }
}

/**
 * One of §6.4's three cards: the white card surface, the card hairline, an
 * 18px radius, 22px of padding, 14px below it and the two-layer card shadow —
 * which is `Card` with `radius="doc"` and `padding="feature"`, rather than that
 * recipe written out a third time.
 *
 * The eyebrow is the card's accessible name, not decoration: three of these
 * stack on the screen and a screen reader needs to know where each begins.
 * `eyebrowGap` is the design's own difference — 12px under the first card's
 * eyebrow, 14px under the other two.
 */
function Section({ eyebrow, eyebrowGap = 'tight', children, ...rest }: {
  eyebrow: string
  eyebrowGap?: 'tight' | 'wide'
  children: ReactNode
}) {
  return (
    <Card radius="doc" padding="feature" className="mb-s7" {...rest}>
      <div className={`text-fs-xxs font-bold text-muted ${eyebrowGap === 'wide' ? 'mb-s7' : 'mb-s6'}`}>
        {eyebrow}
      </div>
      {children}
    </Card>
  )
}

/** "Nothing is recorded here yet" — a fact, not an apology. */
function Blank({ children }: { children: ReactNode }) {
  return <p className="text-fs-sm2 text-faint">{children}</p>
}

/**
 * The design system's `ListEditor` (`components/forms/ListEditor.jsx`), whose
 * own docstring names duties and KPIs as what it is for: one row per value, a
 * destructive square to drop it, and a dashed violet control to append.
 *
 * F11 — the placeholder is not the label. The design system leaves each row's
 * input unlabelled under one heading for the list; here the heading stays and
 * each row also carries its own numbered label, which is what a screen reader
 * needs to tell «وظیفهٔ ۲» from «وظیفهٔ ۳» and what the read view numbers them by.
 */
function RowList({ title, label, placeholder, removeLabel, addLabel, items, onChange }: {
  title: string
  label: string
  placeholder: string
  removeLabel: string
  addLabel: string
  items: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="mt-s6">
      <div className="mb-s5 text-fs-xxs font-bold text-faint">{title}</div>
      <div className="flex flex-col gap-s5">
        {items.map((it, j) => (
          <div key={j} className="flex items-start gap-s5">
            <TextField className="flex-1 min-w-0" ground="sub"
              label={`${label} ${toFa(j + 1)}`} value={it} placeholder={placeholder}
              onChange={(v) => onChange(items.map((x, k) => (k === j ? v : x)))} />
            <RemoveButton label={removeLabel} onClick={() => onChange(items.filter((_, k) => k !== j))} />
          </div>
        ))}
        <AddButton onClick={() => onChange([...items, ''])}>{addLabel}</AddButton>
      </div>
    </div>
  )
}

/**
 * The destructive square — `--tile-c2` under `--conflict` behind a 1.5px
 * `--border-danger` edge, which is `Button`'s `danger` variant's colours at the
 * size the design draws the control.
 *
 * **Not `<Button variant="danger">`.** `Button`'s BASE carries `min-h-touch
 * min-w-touch`, and a `min-` beats a `width` whatever the emitted order is, so
 * a `w-tool h-tool` passed through it paints 44×44 and the class that says 34
 * is never drawn. The plan's one touch-target rule for the whole sub-project is
 * that the PAINTED box stays the design's and a transparent `::before` grows
 * the HIT AREA to 44 — here 34 + 2×5. `src/screens/ProcessList.tsx` reaches the
 * same recipe for the same control; lifting the two into `src/ui/` wants both
 * screens landed first, and is in this task's report.
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
 * The design system's `AddButton`: `inline-flex;gap:6px;12.5px/600 --violet;
 * 1.5px dashed --line-dashed;radius --radius-control;padding:6px 12px`.
 *
 * Local to this screen on purpose. The plan lifts it to `src/ui/AddButton.tsx`
 * once Task 16 has put the same control on the process summary; that task has
 * not run, so a shared file created here would be a primitive with one caller
 * and a second author about to write it — see the report.
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
