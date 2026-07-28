import { useEffect, useState } from 'react'
import { pad2, toFa } from '../../src/lib/format'
import { countActivities } from '../../src/lib/counts'
import type { ExportPayload } from '../shared/payload'
import { FlowViewer } from './FlowViewer'
import { ProcessSheets } from './ProcessSheets'
import { PrintDiagrams } from '../print/PrintDiagrams'
import { diagramsComplete } from '../print/complete'
import { markPrintReady } from '../shared/ready'
import { servedPdfHref } from '../shared/pdfLink'
import d from './document.module.css'

type View = 'home' | 'doc' | 'legend'

/** How long the document keeps *rebuilding* its bands while they are incomplete.
 *  Four ticks of the loop below. This is the window the retry exists for: a
 *  build that ran before Vazirmatn landed measured the wrong glyphs, and a
 *  rebuild on `document.fonts.ready` fixes it. */
const REBUILD_MS = 1400
/** How long it keeps *looking* after it has stopped rebuilding.
 *
 *  These are two different questions and used to share one answer, which is the
 *  bug this constant exists to fix. A rebuild remounts `PrintDiagrams`, whose
 *  sweep mounts, measures and slices **one process at a time** — so a tick that
 *  fires mid-sweep throws the work away and restarts at the first process, and
 *  the last sweep to start lands well after the retry window has closed. When
 *  the document stopped checking at the same moment it stopped rebuilding, that
 *  landing was never observed and the readiness flag never rose *at all*.
 *
 *  Measured on the production host — two cores, shared with two Telegram bots —
 *  the dining department's 15 diagrams finished at **3.1 s**, and every
 *  server-side flowchart render timed out at 90 s with no PDF written. Not a
 *  premature flag: silence.
 *
 *  Bounded all the same — a document that genuinely cannot complete must not poll
 *  forever in a reader's phone — but bounded **above** the server renderer's own
 *  wait, which is `render_pdf`'s `timeout_s` in `ui-backend/inja_ui_backend/pdf.py`
 *  and is 90 s. The two are one handshake and have to be changed together: the
 *  renderer blocks until this document raises `__INJA_PRINT_READY__`, and this
 *  document only raises it while the window below is open. Whichever gives up
 *  first decides the outcome, and it must be the renderer — a document that
 *  settles at 70 s with the window already shut is one the renderer can never be
 *  told about, so it waits out the rest of its 90 s and publishes an HTML with no
 *  PDF beside a document that had in fact finished.
 *
 *  Measured worst case is 5.4 s, so the margin here is enormous either way; the
 *  ordering is what matters, and `ui-backend/tests/test_pdf.py` reads this
 *  constant and pins it against that default so neither can drift alone. */
const WATCH_MS = 120_000

const JSYM = [
  { t: 'XOR', s: 'X', c: '#E23D35', text: 'فقط یکی از مسیرها انجام می‌شود' },
  { t: 'OR', s: 'O', c: '#E8A33D', text: 'یک یا چند مسیر انجام می‌شود' },
  { t: 'AND', s: '&', c: '#2E6FD6', text: 'همهٔ مسیرها انجام می‌شوند' },
]

/** `overview.json` stores the *complete* department label in `name` — the
 *  dining department is saved as «دپارتمان سالن», not the bare «سالن» that
 *  `registry.json` keeps. Every heading below therefore renders `dept.name`
 *  with nothing in front of it; prefixing «دپارتمان» again would read
 *  «دپارتمان دپارتمان سالن». */
export function Document({ payload }: { payload: ExportPayload }) {
  const [view, setView] = useState<View>('home')
  /** The mockup's view mechanism, ported whole: every section stays mounted and
   *  only the open one carries `active`, because `document.module.css` hides the
   *  rest with `.view{display:none}` and — this is the part that matters —
   *  reveals *all* of them again with `.view,.view.print-only{display:block
   *  !important}` under `@media print`. Rendering the sections conditionally
   *  instead would put only the open one in the PDF, and the reader prints from
   *  the landing view, where that is the cover and the contents alone. */
  const cls = (v: View) => `${d.view}${view === v ? ` ${d.active}` : ''}`
  const [flowId, setFlowId] = useState<string | null>(null)
  const { dept, processes } = payload
  /** The server's PDF when this document is being served *and* the server really
   *  printed one; `null` when it was opened from a file, or when the render did
   *  not happen — see `pdfLink`. Starts `null`, so the control is the button that
   *  has always worked until there is evidence for the link: the wrong way round
   *  would show a link that 404s for the moment it takes to find out, on the
   *  document's primary action.
   *
   *  Decided once. A document's location does not change under it, and
   *  re-probing on every keystroke of state would invite the two branches to
   *  disagree mid-session — and put a request behind each of them. */
  const [pdf, setPdf] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    servedPdfHref().then((href) => { if (live) setPdf(href) })
    return () => { live = false }
  }, [])

  // Persian glyph metrics decide how node labels wrap, so a build that ran
  // before Vazirmatn landed can be wrong. Rebuild on the font, on load, and
  // before printing — and retry while the completeness invariant fails.
  const [rebuild, setRebuild] = useState(0)
  useEffect(() => {
    const again = () => setRebuild((n) => n + 1)
    /** The one place `__INJA_PRINT_READY__` is raised, and it is raised behind
     *  the very predicate this loop already retries on. A headless renderer
     *  waits on that flag instead of `load`, which fires long before any band
     *  exists; a second, looser notion of "done" here would hand it a blank
     *  diagram page. Returns whether the document has settled, so the callers
     *  below can keep reading exactly as they did. */
    const settle = () => {
      if (!diagramsComplete(payload)) return false
      markPrintReady()
      return true
    }
    const onBeforePrint = () => { if (!settle()) again() }
    document.fonts?.ready.then(again)
    window.addEventListener('load', again)
    window.addEventListener('beforeprint', onBeforePrint)
    const startedAt = Date.now()
    const t = setInterval(() => {
      if (settle()) { clearInterval(t); return }
      // Four attempts at *rebuilding*, then stop — but keep looking. Past
      // `REBUILD_MS` another `again()` could only throw away a sweep that is
      // already running and start it over, which on a slow machine is how a
      // document that would have finished never finishes at all.
      if (Date.now() - startedAt < REBUILD_MS) again()
    }, 350)
    // One last look on the way out: the tick that would have seen the final
    // rebuild land is the one this cancels, and a document that *is* complete
    // must say so rather than leave the renderer to time out. `settle` is the
    // same check either way, so this can only ever announce a finished
    // document — never hurry an unfinished one.
    const stop = setTimeout(() => { clearInterval(t); settle() }, WATCH_MS)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
      window.removeEventListener('load', again)
      window.removeEventListener('beforeprint', onBeforePrint)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* The mockup's document typography (font, colour, line-height) lives on
          this wrapper rather than on `body`, so it stops here: `FlowViewer` is
          mounted outside it and its canvas keeps the app's own metrics, which
          is the whole point of rendering the site's node components (D2). */}
      <div className="doc-root">
        <div className={d.topbar}>
          <div className={d.tt}>مستند فرآیندهای {dept.name}</div>
          <div className={d.sp} />
          {view !== 'home' && <button className={d.tbtn} onClick={() => setView('home')}>فهرست</button>}
          {/* Served, and the PDF is on the server: hand it over, because printing
              this document from the browser is broken on iOS Safari (see
              `pdfLink`). Opened from a file, or the render did not produce one:
              print in place, exactly as before — there is no server beside a copy
              on a phone, and no link to a file that is not there. In a new tab,
              so a reader who taps it does not lose the document: coming back
              would rebuild every band from scratch. */}
          {pdf
            ? <a className={`${d.tbtn} ${d.solid}`} href={pdf} target="_blank" rel="noopener">چاپ / PDF</a>
            : <button className={`${d.tbtn} ${d.solid}`} onClick={() => window.print()}>چاپ / PDF</button>}
        </div>

        <div className={d.doc}>
          <div className={cls('home')} data-view="home">
            <div className={`${d.sheet} ${d['cover-sheet']}`}>
              <div className={d['cover-inner']}>
                <div className={d['cover-kicker']}>
                  <span className={d.bar} /><span>INJA FOOD · PROCESS DOCUMENTATION</span>
                </div>
                <h1>مستند فرآیندهای<br />{dept.name}</h1>
                <div className={d.sub}>مرجع رسمی نقش‌ها، اهداف عملکردی و فرآیندهای عملیاتی این دپارتمان.</div>
                <div className={d['cover-foot']}>
                  <div className={d.cf}>مجموعه<b>اینجا فست‌فود</b></div>
                  <div className={d.cf}>تعداد فرآیند<b>{toFa(processes.length)} فرآیند</b></div>
                </div>
              </div>
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><h2>فهرست مطالب</h2></div>
              <div className={d['sheet-lead']}>روی عنوان هر بخش کلیک کنید تا همان بخش باز شود.</div>
              <ul className={d.toc}>
                <li onClick={() => setView('doc')}>
                  <span className={d['toc-n']}>۰۱</span>
                  <span className={d['toc-t']}>معرفی واحد، نقش‌ها و KPIها
                    <span className={d['toc-s']}>معرفی واحد · موجودیت‌ها و نقش‌ها · اهداف عملکردی</span>
                  </span>
                  <span className={d['toc-lead']} />
                </li>
                <li onClick={() => setView('legend')}>
                  <span className={d['toc-n']}>۰۲</span>
                  <span className={d['toc-t']}>راهنمای نمادهای فلوچارت
                    <span className={d['toc-s']}>X / O / &amp; — انواع انشعاب</span>
                  </span>
                  <span className={d['toc-lead']} />
                </li>
              </ul>
              <div className={d['toc-group']}>فرآیندها ({toFa(processes.length)})</div>
              <ul className={d.toc}>
                {processes.map((p, i) => (
                  <li key={p.id} onClick={() => setFlowId(p.id)}>
                    <span className={d['toc-n']}>{pad2(i + 1)}</span>
                    <span className={d['toc-t']}>{p.name}
                      <span className={d['toc-s']}>
                        {toFa(countActivities(p.nodes))} فعالیت · <span dir="ltr">{p.id}</span>{p.parent ? ' · زیرفرآیند' : ''}
                      </span>
                    </span>
                    <span className={d['toc-lead']} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={cls('doc')} data-view="doc">
            <div className={d.backbar}>
              <button className={d.backbtn} onClick={() => setView('home')}>بازگشت به فهرست</button>
            </div>
            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۱</span><h2>معرفی {dept.name}</h2></div>
              <div className={d.rule} />
              {dept.description.split(/\n+/).filter((x) => x.trim()).map((par, i) => (
                <div key={i} className={d.prose}>{par}</div>
              ))}
              {dept.sub_units.length > 0 && (
                <>
                  <div className={d['block-label']} style={{ marginTop: 30 }}>
                    <span className={d.sq} style={{ background: 'var(--coral)' }} />واحدها و زون‌ها
                  </div>
                  <div className={`${d.grid} ${d.g2}`}>
                    {dept.sub_units.map((u) => (
                      <div key={u.name} className={`${d.card} ${d.unit}`}>
                        <div className={d['u-name']}>{u.name}</div>
                        <div className={d['u-desc']}>{u.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۲</span><h2>موجودیت‌ها و نقش‌ها</h2></div>
              <div className={d['sheet-lead']}>نقش‌های عملیاتی {dept.name} و وظایف کلیدی هر یک.</div>
              <div className={d.rule} />
              {dept.personnel.map((pr) => (
                <div key={pr.role} className={d.role}>
                  <div className={d['role-head']}>
                    <span className={d['role-name']}>{pr.role}</span>
                    <span className={d['role-tag']}>{toFa(pr.duties.length)} وظیفه · {toFa(pr.kpi.length)} KPI</span>
                  </div>
                  <div className={d['role-body']}>
                    <ul className={d.duties}>{pr.duties.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
              ))}
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۳</span><h2>اهداف عملکردی (KPI)</h2></div>
              <div className={d['sheet-lead']}>شاخص‌های کلیدی عملکرد به تفکیک هر نقش سازمانی.</div>
              <div className={d.rule} />
              {dept.personnel.map((pr) => (
                <div key={pr.role} className={d['kpi-role']}>
                  <div className={d['kr-h']}><span className={d['kr-name']}>{pr.role}</span></div>
                  {pr.kpi.length
                    ? <ul className={d.kpis}>{pr.kpi.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    : <div className={d['kpi-none']}>برای این نقش شاخص عملکردی ثبت نشده است.</div>}
                </div>
              ))}
            </div>
          </div>

          <div className={cls('legend')} data-view="legend">
            <div className={d.backbar}>
              <button className={d.backbtn} onClick={() => setView('home')}>بازگشت به فهرست</button>
            </div>
            <div className={`${d.sheet} ${d['pad-sm']}`}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۲</span><h2>راهنمای نمادهای فلوچارت</h2></div>
              <div className={d['sheet-lead']}>در نقاط انشعاب فرآیندها، این نمادها نوع مسیر را مشخص می‌کنند.</div>
              <div className={d['legend-box']}>
                {JSYM.map((j) => (
                  <div key={j.t} className={d['legend-row']}>
                    <span className={d['lg-sym']}>
                      <span className={d.sq} style={{ background: j.c, borderColor: j.c }} />
                      <span className={d.t} style={{ color: '#fff' }}>{j.s}</span>
                    </span>
                    <span className={d['lg-txt']}>
                      <span className={d.n}>{j.s} — {j.t}</span>
                      <span className={d.d}>{j.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ProcessSheets payload={payload} />
          {/* Inside `.doc-root` on purpose: the bands are *painted* inside these
              sheets, so they have to be *measured* in the same typographic
              context. Measuring outside it would size every box to the site's
              line-height and then paint it at the document's, and the content
              would overflow the box the band reserved for it. */}
          <PrintDiagrams payload={payload} key={rebuild} />
        </div>
      </div>

      {flowId && (
        <FlowViewer processes={processes} startId={flowId} onClose={() => setFlowId(null)} />
      )}
    </>
  )
}
