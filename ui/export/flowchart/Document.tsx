import { useState } from 'react'
import { pad2, toFa } from '../../src/lib/format'
import { countActivities } from '../../src/lib/counts'
import type { ExportPayload } from '../shared/payload'
import { FlowViewer } from './FlowViewer'
import { ProcessSheets } from './ProcessSheets'
import d from './document.module.css'

type View = 'home' | 'doc' | 'legend'

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
  const [flowId, setFlowId] = useState<string | null>(null)
  const { dept, processes } = payload

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
          <button className={`${d.tbtn} ${d.solid}`} onClick={() => window.print()}>چاپ / PDF</button>
        </div>

        <div className={d.doc}>
          {view === 'home' && (
            <>
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
            </>
          )}

          {view === 'doc' && (
            <>
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
            </>
          )}

          {view === 'legend' && (
            <>
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
            </>
          )}

          <ProcessSheets payload={payload} />
        </div>
      </div>

      {flowId && (
        <FlowViewer processes={processes} startId={flowId} onClose={() => setFlowId(null)} />
      )}
    </>
  )
}
