import { useNavigate } from 'react-router-dom'
import { useDepartments } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { toFa } from '../lib/format'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { IconTile } from '../ui/IconTile'
import { StatTile } from '../ui/StatTile'
import { useSurface } from '../ui/surface'

/**
 * The department board, on both of R3's surfaces.
 *
 * The visual audit calls this screen near pixel-faithful to `Inja Panel.dc.html`
 * and it is — so nothing a person sees at 1440px moves here. What changes is
 * everything a person does NOT see: 33 hard-coded values become the tokens that
 * already held them, the two breakpoints §6.16 specifies arrive, and the reader
 * gets its own composition instead of the panel's.
 *
 * **The two surfaces differ in composition, not only in scale.** The reader
 * deliverable (`Inja Reader.dc.html:170`) draws a single-column list of
 * horizontal rows — tile, name, count, chevron — with no eyebrow, no stat row,
 * no accent bar, no watermark numeral and no chips. That is R5 as much as R3: a
 * reader may not edit, so the sub-process and open-conflict counts an editor
 * needs are ABSENT rather than drawn and inert. The watermark is also the one
 * thing the harness could not tolerate on this surface — `departmentsReader`
 * carries no `contrastWaived`, and the numeral is drawn at 1.15:1 on purpose.
 *
 * Everything that is only a scale difference stays in the theme, not here:
 * `IconTile` is `w-tile h-tile` on both surfaces because `--role-tile` is 48px
 * under `:root` and 54px under `[data-surface='reader']`. This file branches
 * only where the two surfaces genuinely disagree — the column, the padding, the
 * H1's size AND colour, the grid, the card's radius and rest shadow, and which
 * composition is drawn.
 */
export function Departments() {
  const nav = useNavigate()
  const reader = useSurface() === 'reader'
  const { data = [] } = useDepartments()

  const totalProc = data.reduce((a, d) => a + (d.count ?? 0), 0)
  // The open-conflict count is served only for a department the viewer may edit,
  // and is absent — not zero — for the rest. So the tile is drawn only when at
  // least one department carried the key, and sums only those: a reader who was
  // told nothing is shown nothing, rather than a green ۰ asserting "no open
  // conflicts" on their behalf. Absence of a claim, not a claim of absence.
  const totalConflicts = data.reduce((a, d) => a + (d.conflicts ?? 0), 0)
  const knowsConflicts = data.some((d) => d.conflicts !== undefined)
  const hasConflicts = totalConflicts > 0

  // §6.16 gives every `[data-r-pad]` the same `18px 14px` at ≤760, so the mobile
  // pair is written once for both surfaces and only the desktop set branches.
  // `max760:py-s9` beats the `pt-`/`pb-` beside it because Tailwind sorts every
  // variant after every bare utility in the same layer — asserted in the suite,
  // because the class attribute's own order decides nothing.
  const pad = reader
    ? 'pt-screen-y px-reader-x pb-reader-bottom'          // 30 / 24 / 60
    : 'pt-departments-top px-screen-x pb-departments-bottom'  // 38 / 40 / 48

  return (
    // §6.0 — the shell owns the violet field, and this root repaints it because
    // the gate reads `background-color` off THIS element with `getComputedStyle`,
    // which does not inherit. A root that painted nothing would compute
    // `rgba(0, 0, 0, 0)` however violet the shell behind it is.
    <div
      data-screen={reader ? 'departmentsReader' : 'departments'}
      data-r-pad
      className={`flex-1 overflow-auto bg-ink ${pad} max760:px-s7 max760:py-s9`}
    >
      <div data-col className={`${reader ? 'max-w-reader' : 'max-w-departments'} mx-auto`}>

        <div
          data-r-stack
          className={reader
            ? 'mb-s11'
            : 'flex items-end justify-between gap-s11 flex-wrap mb-s12 '
              + 'max760:flex-col max760:items-stretch max760:gap-s6'}
        >
          <div>
            {/* The eyebrow is the panel's: the reader deliverable's home screen
                opens on its title. */}
            {!reader && (
              <div className="flex items-center gap-s4 mb-s5">
                <span aria-hidden className="w-s10 h-half bg-coral rounded-bar" />
                <span className="text-fs-xs font-bold tracking-eyebrow text-role-eyebrow">
                  INJA FOOD · مستندسازی فرآیند
                </span>
              </div>
            )}
            <h1
              data-h1
              data-r-title
              className={`font-extrabold ${reader
                ? 'text-fs-h1-reader-home text-role-title-on-field'
                : 'text-fs-display max760:text-fs-display-hand text-on-dark tracking-display'}`}
            >
              {reader ? 'دپارتمان‌های من' : 'دپارتمان‌ها'}
            </h1>
            {/* One colour for both surfaces and it is the ROLE, never
                `text-violet-on-dark-body`: that token's name still reads like the
                answer, and Task 3 re-cut its value out from under it (L-28). No
                hex is spelled in this file, in code OR in a comment — Tailwind's
                scanner does not read a comment differently from code. */}
            <p
              data-body
              className={`text-role-subtitle-on-field mt-s4 ${reader
                ? 'text-role-dense leading-sub'
                : 'text-fs-body max-w-subtitle leading-normal'}`}
            >
              {reader
                ? 'کدام بخش را می‌خواهید بخوانید؟'
                : 'نقشهٔ فرآیندهای مجموعه به تفکیک واحد. یک دپارتمان را برای مرور فرآیندهای مستندشده، کارت خلاصه و فلوچارت انتخاب کنید.'}
            </p>
          </div>

          {/* The stat row is panel chrome: the reader deliverable's home screen
              carries no counters, only the list. R3 — a difference in
              composition, not a difference in theme. */}
          {!reader && (
            <div className="flex gap-s6 flex-none max760:hidden">
              <StatTile value={totalProc} label="فرآیند مستند" tone="violet" />
              <StatTile value={data.length} label="دپارتمان" tone="ink" />
              {knowsConflicts && (
                <StatTile
                  value={totalConflicts}
                  label="تعارض باز"
                  tone={hasConflicts ? 'conflict' : 'ok'}
                  dot={hasConflicts}
                />
              )}
            </div>
          )}
        </div>

        <div
          data-grid
          data-r-deptgrid
          className={reader
            ? 'grid grid-cols-1 gap-s7'
            : 'grid grid-cols-3 gap-s9 max1080:grid-cols-2 max760:grid-cols-1'}
        >
          {data.map((d, i) => {
            const m = deptMeta(d.code)
            return reader ? (
              <Card
                key={d.code}
                data-card
                hoverLift
                radius="doc"
                padding="feature"
                onClick={() => nav(`/departments/${d.code}`)}
                className="flex items-center gap-s8 cursor-pointer"
              >
                <IconTile dept={d.code} />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-fs-h3 text-ink">{d.name}</div>
                  <div className="text-fs-menu text-muted mt-s3">
                    {toFa(d.count)} فرآیند مستند
                  </div>
                </div>
                {/* The reader's chevron disc is violet for every department: the
                    deliverable tints the tile by accent and leaves this one
                    fixed. */}
                <span
                  aria-hidden
                  className="w-tool h-tool rounded-round flex-none flex items-center justify-center text-violet bg-disc-violet"
                >
                  <Icon name="chevronEnd" px={16} stroke={2.4} />
                </span>
              </Card>
            ) : (
              <Card
                key={d.code}
                data-card
                hoverLift
                radius="feature"
                padding="feature"
                onClick={() => nav(`/departments/${d.code}`)}
                className="relative overflow-hidden cursor-pointer shadow-feature"
              >
                <span
                  aria-hidden
                  className={`absolute top-0 inset-x-0 h-1 ${m.accent === 'coral' ? 'bg-conflict' : 'bg-violet'}`}
                />
                {/* `end-`, never a physical inset: in RTL the ghosted numeral
                    sits on the inline END, which is the page's left. The physical
                    spelling this replaces was one of the four mirror bugs O5
                    lists, and it is invisible until an LTR locale exists. */}
                <span
                  aria-hidden
                  className={`absolute top-s7 end-s10 text-fs-numeral font-extrabold leading-none pointer-events-none ${m.numeralClass}`}
                >
                  {toFa(String(i + 1).padStart(2, '0'))}
                </span>
                <IconTile dept={d.code} />
                <div className="font-extrabold text-fs-dialog text-ink mt-s8">
                  دپارتمان {d.name}
                </div>
                <div className="flex items-center gap-s3 flex-wrap mt-s5 min-h-chiprow">
                  <span className="inline-flex items-center gap-s2 text-fs-xs font-semibold text-dialog-ghost bg-tile-v3 px-s5 py-s1 rounded-pill">
                    <Icon name="file" px={12} />
                    {toFa(d.count)} فرآیند
                  </span>
                  {(d.subs ?? 0) > 0 && (
                    <span className="text-fs-xxs font-semibold text-warn bg-tile-warn px-s5 py-s1 rounded-pill">
                      {toFa(d.subs)} زیرفرآیند
                    </span>
                  )}
                  {d.conflicts !== undefined && d.conflicts > 0 && (
                    <span className="inline-flex items-center gap-s1 text-fs-xxs font-bold text-conflict bg-tile-c px-s5 py-s1 rounded-pill">
                      <span aria-hidden className="w-s3 h-s3 rounded-round bg-coral" />
                      {toFa(d.conflicts)} تعارض
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-s5 mt-s8 pt-s8 border-t border-hair">
                  <span className={`text-fs-sm2 font-bold ${m.accentText}`}>مشاهدهٔ فرآیندها</span>
                  <span
                    aria-hidden
                    className={`w-tool h-tool rounded-round flex-none flex items-center justify-center ${m.accentText} ${m.ctaDiscClass}`}
                  >
                    <Icon name="chevronEnd" px={16} stroke={2.4} />
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
