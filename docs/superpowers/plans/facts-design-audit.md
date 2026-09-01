# Facts UI — design audit (Task 21, Step 1)

**The reference every later facts UI task builds from. Numbers come from here,
and here took them from the file — never from memory.**

Source of authority: the facts section of `ui/design/Inja Panel.dc.html`
(5416 lines, landed 2026-08-30, 22:44 save), corrected **only** by the ten
"Design conformance notes" at the end of spec §14
(`docs/superpowers/specs/2026-08-29-quantitative-facts-design.md:1688–1726`),
the owner's recorded decisions (§6 and §6.3 below) and
`docs/superpowers/ui-normalisation-ledger.md`. Nothing else corrects it.

**§9 is the closure table**: for each of the ten notes, the test that fails when
it regresses, and the mutant that proved so.

Regions read for this audit:

| region | lines |
|---|---|
| responsive rules (`@media`) | 32–90 |
| `FACTS LIST` markup | 998–1104 |
| `FACT DETAIL` markup | 1106–1751 |
| `FACT CONFIRM DIALOG` markup | 1753–1765 |
| facts logic — `CONF`, `stOf`, filters, `factRow`, formatters | 4621–4795 |
| facts bindings — the object the template reads | 4796–5079 |
| mock data the design renders | `ui/design/mock/facts/api/*.json` |

Nothing in this file is invented. Where the design has no home for something
the spec or the plan asks for, it went to the user as a consult item. **All
five came back answered on 2026-08-31 and §6 now records the decisions** — two
refused and to be left undrawn, two approved with the shape she gave them, one
settled. §6 is authority for Tasks 22–24; nothing in it is still open.

---

## 1. Screen regions → the design's exact values

### 1.1 List screen (`isFacts`, markup 999–1072)

| region | property | value (verbatim from the file) |
|---|---|---|
| page pad | `[data-r-pad]` | `flex:1;overflow:auto;padding:30px 40px` |
| page pad ≤760px | | `padding:18px 14px !important` |
| column | | `max-width:960px;margin:0 auto` |
| section title | | `font-weight:800;font-size:22px;color:#fff` — «داده‌های کمّی» |
| spacer under title | | `height:20px` |
| card | | `background:#fff;border:1px solid rgba(42,29,94,.07);border-radius:18px;overflow:hidden` |
| card shadow | | `0 1px 2px rgba(16,10,40,.16),0 14px 30px -16px rgba(16,10,40,.55)` |
| search band | | `padding:13px 18px;border-bottom:1px solid #EDE5F5` |
| search input | | `width:100%;padding:11px 40px;border:1.5px solid #E3D8F5;border-radius:12px;font-size:13px;color:#2A1D5E;background:#FBF9FE;outline:none` |
| search input focus | | `border-color:#FA5A52` |
| search placeholder | | «جست‌وجوی عنوان داده…» |
| search icon | | 16×16, `stroke="#a99fc4"` `stroke-width="2"`, `position:absolute;right:14px;top:50%;transform:translateY(-50%);pointer-events:none`; `<circle cx=11 cy=11 r=7>` + `m21 21-4.3-4.3` |
| filter band | `[data-r-afilters]` | `display:grid;grid-template-columns:repeat(4,1fr);align-items:center;gap:8px;padding:13px 18px;border-bottom:1px solid #EDE5F5` |
| filter band ≤760px | | `grid-template-columns:1fr 1fr;align-items:stretch;padding:12px;gap:8px` |
| filter trigger | | `width:100%;display:flex;align-items:center;justify-content:space-between;gap:7px;padding:9px 13px;border:1.5px solid {border};border-radius:11px;background:{bg};color:{fg};font-size:12.5px;font-weight:600;cursor:pointer` |
| …its three states | | border `#FA5A52` while its menu is open, else `#E3D8F5`; bg `#F4EFFB` when a value is picked, else `#fff`; fg `#4A25A9` when picked, else `#8a7db0` |
| filter chevron | | 13×13, `stroke="currentColor"` `stroke-width="2.2"`, `M6 9l6 6 6-6`, `flex:none` |
| filter menu | `[data-r-fmenu]` | `position:absolute;top:calc(100% + 6px);inset-inline-start:0;min-width:200px;max-height:212px;overflow:auto;background:#fff;border:1px solid rgba(42,29,94,.07);border-radius:14px;box-shadow:0 20px 45px -20px rgba(74,37,169,.45);padding:7px;z-index:37;display:flex;flex-direction:column;gap:2px` |
| filter menu ≤760px | | `inset-inline:12px;min-width:0` (a second rule later in the same block sets `10px`; the last wins) |
| filter option | | `display:flex;align-items:center;gap:9px;padding:10px 12px;border:0;border-radius:11px;background:{picked?#F4EFFB:transparent};font-size:13px;font-weight:{picked?700:600};color:#2A1D5E;text-align:start`, hover `background:#F4EFFB` |
| option tick | | 14×14, `stroke="#4A25A9"` `stroke-width="3"`, `M20 6L9 17l-5-5` |
| clear-all link | | `grid-column:1 / -1;justify-self:start;border:0;background:transparent;padding:4px;font-size:12.5px;font-weight:700;color:#E23D35;cursor:pointer;text-decoration:underline;text-underline-offset:3px` — «پاک کردن همهٔ فیلترها» |
| table head | `[data-r-thead]` | `display:grid;grid-template-columns:1.7fr .8fr .9fr 1.1fr 1.1fr 34px;align-items:center;gap:14px;padding:12px 18px;background:#F8F4FE;border-bottom:1px solid #EDE5F5` |
| head cell | | `font-size:11.5px;font-weight:700;color:#8a7db0` |
| head labels | | عنوان · شناسه · نوع · دپارتمان · وضعیت · (empty 6th) |
| head ≤760px | | `display:none` |
| empty state | | `text-align:center;padding:44px 20px;color:#a99fc4;font-size:13px` — «با این فیلترها داده‌ای نیست» |
| row | `[data-r-trow]` | same grid; `padding:14px 18px;border-bottom:1px solid #F4F0FA;cursor:pointer;transition:background .14s ease`, hover `background:#FBF9FE` |
| row ≤760px | | `display:flex;align-items:center;gap:11px;padding:14px`; 2nd child `flex:1 1 auto`; `[data-r-tcol3]` cells `display:none` |
| row · title | | `font-weight:700;font-size:14px;color:#2A1D5E`, ellipsis, inside `min-width:0` |
| row · id | `[data-r-tcol3]` | `dir="ltr"`, `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace`, `font-size:11.5px;color:#8a7db0;text-align:right`, ellipsis |
| row · kind | | `font-size:12.5px;color:#2A1D5E;font-weight:600`, ellipsis |
| row · scope | `[data-r-tcol3]` | `font-size:12.5px;color:#8a7db0`, ellipsis |
| row · status dot | | `width:8px;height:8px;border-radius:50%;flex:none;background:{r.dot}`, `gap:7px` |
| row · status label | | `font-size:12.5px;font-weight:600;color:{r.chipFg};text-decoration:{r.staleStrike}`, ellipsis |
| row · note line | | shown on `{{ r.hasNote }}`: `font-size:10.5px;color:#a99fc4;margin-top:4px`, ellipsis — **the node exists, the binding does not; see §5** |
| row · chevron | | `width:30px;height:30px;border-radius:50%;background:#F3EDFC;color:#4A25A9`; icon 14×14 `stroke-width="2.4"` `M15 18l-6-6 6-6` |

Filter definitions (`fFilterDefs`, 4637–4642) — four, in this order:

| key | blank label | options |
|---|---|---|
| `fk` | نوع | `this.FKIND` (the five kinds) |
| `fdp` | دپارتمان | `DEPT_FA` + a `__u` option labelled «سراسری» |
| `fbr` | شعبه | `BRANCH_FA` |
| `fconf` | وضعیت تأیید | `CONF` — «تأییدشده» / «تأییدنشده» |

The blank option is prepended to every menu with the blank label as its text.
Search matches `title` by substring and `id` case-insensitively (4645).

### 1.2 Detail screen (`isFactDetail`, markup 1107–1750)

Column `max-width:880px;margin:0 auto`, page pad `26px 40px 40px`.
Card shadow is the list's, everywhere. Card border is
`1px solid rgba(42,29,94,.07)` everywhere except the accounts card.

| # | card / band | key values |
|---|---|---|
| header chips | `display:flex;align-items:center;gap:9px;flex-wrap:wrap` | kind chip `font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.16);color:#fff`; confirmation chip same box, `font-weight:600`, bg/fg from `sfChipBg`/`sfChipFg` (both hard-coded: `rgba(255,255,255,.16)` / `#fff`); scope line `font-size:12px;color:#C9BEEE`; `port` and `retired` chips `background:#FFE9E7;color:#E23D35` — «باید عیناً در ERP پیاده شود» / «بازنشسته» |
| title row | `[data-r-stack]` | `display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-top:12px`; title `font-weight:800;font-size:25px;color:#fff;line-height:1.55` |
| confirm tick | on `sfCanTick` | `padding:11px 16px;border-radius:13px;border:1.5px solid {sfTickOuter};background:{sfTickChipBg};color:{sfTickChipFg};font-weight:700;font-size:13px;gap:9px`; inner box `18px×18px;border-radius:6px;border:1.5px solid {sfTickBorder};background:{sfTickBg};color:#fff`; check 12×12 `stroke-width="3"` |
| …tick palette | | green: bg `#1F8A5B`, border `#1F8A5B`, chip bg `#E4F6EC`, chip fg `#1F8A5B`, outer `#BFE5D0`, action «تأییدشده»; unconfirmed: bg `#fff`, border `#C9B8EC`, chip bg `#fff`, chip fg `#4A25A9`, outer `#fff`, action «تأیید این مورد»; red (`red_disputed`/`red_unknown`): border `#F3D9D7`, chip bg `rgba(255,255,255,.08)`, chip fg `#E9E0F7`, outer `rgba(255,255,255,.2)`, action «قابل تأیید نیست» |
| statement | 1128 | `border-radius:18px;padding:20px 22px;margin-top:16px;border-inline-start:4px solid #4A25A9`; eyebrow «بیان» `font-size:11px;font-weight:700;color:#8a7db0;margin-bottom:9px`; body `font-size:17px;color:#2A1D5E;line-height:2.15;text-align:justify;text-wrap:pretty` |
| aliases | 1132 | strip `margin-top:14px;padding-top:13px;border-top:1px solid #F0E9FB`; label «نام‌های دیگر» `font-size:11px;color:#a99fc4`; chip `font-size:12.5px;font-weight:600;color:#4A25A9;background:#F4EFFB;border:1px solid #E9E0F7;padding:4px 11px;border-radius:999px` |
| constant (`sfIsConst`) | 1142 | card `border-radius:20px;padding:24px;margin-top:22px`; value `dir="ltr"` mono `font-size:44px;font-weight:800;line-height:1;color:{o.bigFg}` (`#E23D35` when the value is `null`, else `#2A1D5E`); unit `font-size:16px;font-weight:700;color:#8a7db0`; nature pill `#F0E9FB`/`#4A25A9`; «به ازای هر {per}» pill `#F4EFFB`/`#8a7db0`; «برای» and «ثبت در» rows label width `70px` |
| formula (`sfHasExpr`) | 1174 | eyebrow «فرمول»; block `dir="ltr"` mono `font-size:15px;line-height:2.1;color:#2A1D5E;background:#FBF9FE;border:1px solid #EDE5F5;border-radius:14px;padding:18px 20px;text-align:left;overflow-x:auto` |
| decision table | 1183 | head band `padding:15px 18px;border-bottom:1px solid #EDE5F5`; «جدول تصمیم» `13px/700/#2A1D5E`; hit pill `#F0E9FB`/`#4A25A9`; aggregate pill `#FBEEDC`/`#8A5A00`; grid `minmax(120px,1fr)` per column; head cell `11px/700/#8a7db0;padding:10px 12px`; body cell `padding:11px 12px`, input cells `600`/`#2A1D5E`, output cells `800`/`#4A25A9`; default band `padding:12px 18px;background:#FBF9FE` — «در غیر این صورت» |
| lifecycle | 1213 | head «اعتبار زمانی» `padding:14px 18px;font-size:12px;font-weight:700;color:#2A1D5E;background:#F8F4FE`; `valid_to` value `#E23D35` + pill «بسته‌شده» `#FFE9E7`/`#E23D35`; supersedes / superseded_by rows label width `120px`, link `#4A25A9` `underline dotted` offset `3px` |
| original | 1243 | **only** «نام تابع» is drawn (`sfHasIdentifier`) — mono `15px/800/#4A25A9`, label width `120px`. `sfHasOriginalRef` / `sfOriginalRef` / `sfOriginalNote` are computed and rendered nowhere (§4). |
| template | 1255 | label «الگو» width `120px`; divergence `font-size:11.5px;font-weight:700` coloured `#E23D35` drift / `#8A5A00` intentional / `#1F8A5B` otherwise |
| calls | 1265 | «فراخوانی‌ها» `12.5px/#8a7db0`; chip button `font-size:12.5px;font-weight:600;color:#2A1D5E;background:#FBF9FE;border:1px solid #EDE5F5;padding:7px 12px;border-radius:11px`, hover `border-color:#C9B8EC;background:#F4EFFB` |
| inputs / outputs | 1278 | `[data-r-2col]` `grid-template-columns:1fr 1fr;gap:14px` (1fr at ≤760px); inputs head `background:#F8F4FE;border-bottom:1px solid #EDE5F5`, «چه چیزهایی لازم دارد» `13px/800/#4A25A9` + «عددهایی که این قاعده از جای دیگر می‌خواند» `11.5px/#8a7db0/1.8`; outputs head `background:#F1FAF5;border-bottom:1px solid #DDEFE5`, «چه چیزی می‌سازد» `13px/800/#1F8A5B` + «نتیجهٔ این قاعده و جایی که نوشته می‌شود»; output unit pill `#E4F6EC`/`#1F8A5B`; share pill `#F4EFFB`/`#4A25A9` — «{pct} از ورودی»; sub-label width `96px` |
| record grid | 1342 | head «{n} ردیف» `13px/700`, grain `11.5px/#a99fc4`, legend `margin-inline-start:auto;font-size:11px;color:#a99fc4` — «خانهٔ قرمز یعنی مقدارش در منبع ثبت نشده یا سرِ آن اختلاف است»; columns `minmax(110px,1fr)` (+`minmax(140px,1fr)` for the row-key column when `primaryKey` is empty); cell `padding:11px 12px`, `font-size:12.5px`; **disputed cell** `background:#FFE9E7;color:#E23D35;font-weight:800`; **unknown cell** `background:#FBEEDC;color:#E23D35;font-weight:800`; normal `transparent`/`#2A1D5E`/`600` |
| columns table | 1368 | head «{n} ستون»; grid `1.6fr .8fr 1fr`; title `14px/700/#2A1D5E`; notes `12px/#8a7db0/1.9`; unit pill `#F4EFFB`/`#4A25A9` — **red variant `#FFE9E7`/`#E23D35` with «واحد ثبت نشده»**; type label `11px/#a99fc4`; key mono `11px/#8a7db0` |
| printed form rows | 1402 | «قلم‌های چاپ‌شده روی فرم» `14px/800`; body copy `12.5px/#8a7db0/1.9`; row `padding:14px 20px`, retired `opacity:.55` + pill «دیگر استفاده نمی‌شود» `#FFE9E7`/`#E23D35`; sub-label width `104px`; «چه روزی» value `#8A5A00`; «ردیف خالی» value `#4A25A9` |
| record structure | 1448 | head «ساختار و مکان جدول»; every label width `120px`; «برگهٔ خالی برای پر کردن» pill `#F0E9FB`/`#4A25A9`; header-field chip `#FBF9FE`/`1px solid #EDE5F5`/`border-radius:10px` |
| item | 1554 | code `dir="ltr"` mono `26px/800/#2A1D5E`; category pill `#F0E9FB`/`#4A25A9`; base unit mono `17px/800/#4A25A9`; label width `110px`; pack chip `#FBF9FE`/`#EDE5F5`/`border-radius:11px`; tracked label `#1F8A5B` / `#E23D35` |
| measurement | 1618 | `[data-r-2col]` `repeat(2,1fr)`, each pane `padding:16px 18px`, eyebrow `11px/#a99fc4`, value `14–16px` |
| edge cases | 1656 | head «موارد خاص»; grid `1fr 1fr 1.2fr`; head band `background:#FBF9FE`; expected `#1F8A5B/600` |
| accounts | 1672 | card `border:1.5px solid #F8DDDA;border-radius:20px;padding:20px;margin-top:22px`; title «روایت‌های متعارض» `12px/700/#E23D35`; lede «دو منبع دو چیز می‌گویند. یکی را انتخاب کنید تا فیلد صریح شود.» `12px/#8a7db0/1.8`; each account `border:1px solid #EDE5F5;border-radius:14px;padding:14px 16px;margin-bottom:10px`; value mono `16px/800/#4A25A9`; statement `14.5px/#2A1D5E/2.1` with `dir` and font chosen by whether it contains Persian; choose button `padding:9px 14px;border-radius:11px;background:#4A25A9;color:#fff;font-weight:700;font-size:12px;box-shadow:0 10px 22px -13px rgba(74,37,169,.9)` — «انتخاب این روایت» |
| issues | 1694 | `background:#FBEEDC;border:1px solid #F0DDBB;border-radius:16px;padding:16px 18px;margin-bottom:10px`; «نقص: {kind}» `11.5px/700/#8A5A00`; body `14.5px/#5a4a1e/2.1` |
| sources | 1705 | head «منابع»; row `padding:11px 18px;border-bottom:1px solid #F4F0FA`; type label `11.5px/700/#4A25A9;width:96px`; ref mono `11.5px/#2A1D5E`; «at» line `11px/#a99fc4` |
| related processes | 1717 | eyebrow «فرایندهای مرتبط» `11px/700/#8a7db0;padding:12px 18px 4px`; row `padding:10px 18px`, hover `#FBF9FE`; ref mono `11px/#4A25A9` `underline dotted`; tombstone pill `#FBEEDC`/`#8A5A00` — «اشاره به فرایند بازنشسته (جایگزین: {heir})» |
| consumers | 1729 | eyebrow «استفاده‌کنندگان»; chip button `12px/600/#2A1D5E;background:#FBF9FE;border:1px solid #EDE5F5;padding:7px 12px;border-radius:11px`, hover `border-color:#C9B8EC;background:#F4EFFB`; id inside it mono `10px/#a99fc4` |
| footer chip row | 1741 | `padding:12px 18px;background:#FBF9FE;border-top:1px solid #EDE5F5;gap:14px`; id and key mono `11px`, `#8a7db0` / `#a99fc4`; separators `|` `#DCD3EC`; «آخرین تغییر {jalali}» `11px/#a99fc4` |

### 1.3 Confirm dialog (`factAsk`, markup 1753–1765)

| part | value |
|---|---|
| scrim | `position:fixed;inset:0;background:rgba(36,17,82,.45);display:flex;align-items:center;justify-content:center;z-index:62;padding:24px` |
| box | `width:440px;max-width:100%;background:#fff;border:1px solid rgba(42,29,94,.07);border-radius:22px;padding:24px` |
| box shadow | `0 4px 10px rgba(16,10,40,.28),0 44px 90px -30px rgba(16,10,40,.8)` |
| title | `font-weight:800;font-size:17px;color:#2A1D5E;line-height:1.6` |
| body | `font-size:13.5px;color:#5a5175;line-height:1.9;margin-top:10px;text-wrap:pretty` |
| actions | `display:flex;gap:10px;margin-top:20px`, each `flex:1;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px` |
| confirm button | `background:{factAsk.okBg};color:#fff` |
| cancel button | `border:1.5px solid #E3D8F5;background:#fff;color:#4A25A9` — «انصراف» |

Three dialogs the design opens (5042, 5073–5078):

| trigger | title | body | ok | okBg |
|---|---|---|---|---|
| confirm | کل این داده تأیید شود؟ | اثر انگشت از کل داده گرفته می‌شود؛ هر تغییر بعدی تأیید را باطل می‌کند. | تأیید می‌کنم | `#1F8A5B` |
| revoke | تأیید این داده برداشته شود؟ | داده به حالت تأییدنشده برمی‌گردد. | برداشتن تأیید | `#FA5A52` |
| choose account | این روایت انتخاب شود؟ | روایت انتخابی «انتخاب‌شده» و بقیه «ردشده» علامت می‌خورند و وضعیت فیلد صریح می‌شود. | انتخاب می‌کنم | `#4A25A9` |

### 1.4 The confirmation map (4624–4631)

```
CONF = {
  green:{ label:'تأییدشده', fg:'#1F8A5B', dot:'#1F8A5B', strike:'none' },
  amber:{ label:'تأییدنشده', fg:'#8A5A00', dot:'#E8A33D', strike:'none' },
}
CONF_KEYS = { green:1, amber:1 }
stOf = (r) => ...; return CONF_KEYS[v] ? v : 'amber'
```

The comment above it — «وضعیت تأیید سه حالت است» ("three states") — is stale
leftover prose; the code is two states and folds everything else to `amber`.
**The code is the truth.**

---

## 2. Design values → tokens (`ui/src/styles/tokens.css` + the four frozen DS files)

Every colour the facts section paints, resolved against the token set.

| design value | token | file |
|---|---|---|
| `#fff` (a card, a button face) | `--card` (`#FFFFFF`) | colors.css |
| `rgba(42,29,94,.07)` | `--border-card` | tokens.css |
| `0 1px 2px rgba(16,10,40,.16),0 14px 30px -16px rgba(16,10,40,.55)` | `--shadow-card` | tokens.css |
| `0 4px 10px rgba(16,10,40,.28),0 44px 90px -30px rgba(16,10,40,.8)` | `--shadow-modal` | tokens.css |
| `0 20px 45px -20px rgba(74,37,169,.45)` | `--shadow-pop` | tokens.css |
| `0 10px 22px -13px rgba(74,37,169,.9)` | `--shadow-violet` | effects.css |
| `#EDE5F5` | `--border-current` | colors.css |
| `#E3D8F5` | `--line` | colors.css |
| `#FBF9FE` | `--surface-sub` | tokens.css |
| `#F4F0FA` | `--line-row` | tokens.css |
| `#F8F4FE` | `--tile-v4` | colors.css |
| `#F4EFFB` | `--tile-v2` | colors.css |
| `#F0E9FB` | `--tile-v` (= `--line-soft`, `--icom-mech-bg`) | colors.css |
| `#F3EDFC` | `--disc-violet` | tokens.css |
| `#E9E0F7` | `--line-filter` | tokens.css |
| `#C9B8EC` | `--border-pick` (= `--line-dashed`) | tokens.css |
| `#2A1D5E` | `--ink` / `--text-strong` | colors.css |
| `#4A25A9` | `--violet` | colors.css |
| `#8a7db0` | `--text-muted` | colors.css |
| `#a99fc4` | `--text-faint` | colors.css |
| `#5a5175` | `--text-body` | tokens.css |
| `#C9BEEE` | `--violet-on-dark-body` (= `--violet-on-violet`) | tokens.css |
| `#DCD3EC` | `--text-crumb-sep` | tokens.css |
| `#FA5A52` | `--coral` | colors.css |
| `#E23D35` | `--conflict` / `--danger` | colors.css |
| `#FFE9E7` | `--tile-c` | colors.css |
| `#1F8A5B` | `--green` / `--ok` | colors.css |
| `#E4F6EC` | `--tile-ok` | colors.css |
| `#BFE5D0` | `--border-ok` | tokens.css |
| `#E8A33D` | `--junction-or` | colors.css |
| `#8A5A00` | `--warn-fg` (= `--icom-control-fg`) | tokens.css |
| `#FBEEDC` | `--tile-warn` | colors.css |
| `#F0DDBB` | `--warn-edge` | tokens.css |
| `rgba(36,17,82,.45)` | `--scrim` | colors.css |
| `30px` / `40px` page pad | `--pad-screen-y` / `--pad-screen-x` | spacing.css |
| `960px` | `--width-summary` | spacing.css |
| `440px` dialog | `--width-dialog-xs` | tokens.css |
| radii `18 / 20 / 22 / 16 / 14 / 13 / 12 / 11 / 10 / 999 / 50%` | `--radius-doc` / `--radius-card-lg` / `--radius-sheet` / `--radius-card` / `--radius-tile` / `--radius-lg` / `--radius-md` / `--radius-input` / `--radius-control` / `--radius-pill` / `--radius-round` | spacing.css + tokens.css |
| radius `6px` (tick box) | `--radius-tick` (= `--radius-badge`) | tokens.css |
| fs `9 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 14.5 / 15 / 16 / 17 / 22 / 25 / 26` | `--fs-tag` / `--fs-nano` / `--fs-micro` / `--fs-xxs` / `--fs-xs` / `--fs-caption` / `--fs-sm2` / `--fs-sm` / `--fs-menu` / `--fs-body` / `--fs-body-lead` / `--fs-lg` / `--fs-h5` / `--fs-h4` / `--fs-h2` / `--fs-display-hand` / `--fs-steps-title` | typography.css + tokens.css |
| lh `1.6 / 1.7 / 1.75 / 1.8 / 1.9 / 2.1 / 1` | `--lh-snug` / `--lh-normal` / `--lh-relaxed` / `--lh-sub` / `--lh-loose` / `--lh-looser` / `--lh-none` | typography.css + tokens.css |
| pad steps `4 / 5 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 22 / 26 / 30 / 38 / 40` | `--space-1 … --space-16` (fourteen rungs: `s1…s12, s14, s16`) | spacing.css |
| `1.5px` control border | `--border-hairline` | tokens.css |
| `.14s ease` row hover | `--duration-row` + `--ease-css` | tokens.css |
| `#F3EDFC` chevron tile, `30px` box | `--disc-violet`, `--size-chev` | tokens.css |
| `34px` last grid track | `--size-pager` value; the users grid already ends `… 34px` | tokens.css |

> **Corrected 2026-09-01 (Task 24).** The pad-step row above used to list a
> `20px` rung. **There is none.** The frozen ladder is
> `4, 5, 6, 8, 10, 12, 14, 16, 18, 22, 26, 30, 38, 40` — fourteen values, and
> `tailwind.config.js` emits `s1…s12, s14, s16` accordingly. The detail screen
> draws a `20px` padding at **five** sites, and every one of them is written
> **exact and inline** in `cards/parts.tsx`'s `PX` rather than rounded to 18 or
> 22 (Task 23 report §7). `20px` is on the
> `UNTOKENISED` list below for the owner and is the row worth her attention:
> it is the detail screen's commonest card padding, and `tokens.css` already
> records that the value has four owners, none of them a card.

### 2.1 `UNTOKENISED` candidates — **for the owner, not for this task to mint**

`guards.test.ts`'s `UNTOKENISED` list is empty and its rule is explicit: a file
goes back on it only for *a value the design draws that nothing holds*, with its
role and its design line, **and it goes to the owner in the same breath**. This
is that list. Nothing below is minted here.

**Two rows have since left it.** The owner ruled on 2026-09-01, shown the
rendered screen rather than the swatches, that the outputs card's header must
read as the paler band she drew rather than flattening into the unit pills
below it — so `#F1FAF5` and `#DDEFE5` were **minted by Task 23** as
`--tile-ok2` / `--border-ok2`, named on the `--tile-v2…--tile-v5` / `--tile-c2`
ladder the palette already uses for "the paler second tint of this hue". They
are struck through below rather than deleted, so the reference still records
what was asked and what was answered. The other three colour rows were shown to
her in the same pass and **accepted as they are** — each is within a shade of
the family token the screen substitutes.

| value | role | design line |
|---|---|---|
| `#F8DDDA` | the accounts card's 1.5px edge (`--border-danger` is `#FDD9D6`, a different value; `--steps-group-border` aliases `--border-danger` and its comment records `#F8DDDA` as a *previous* value) | 1673 |
| ~~`#F1FAF5`~~ | ~~the outputs card head fill~~ — **minted 2026-09-01 as `--tile-ok2`** | 1308 |
| ~~`#DDEFE5`~~ | ~~the outputs card head border~~ — **minted 2026-09-01 as `--border-ok2`** | 1308 |
| `#5a4a1e` | the issue card's body ink on `--tile-warn` | 1698 |
| `#F3D9D7` | the disabled (red) tick's inner border | 5065 |
| `rgba(255,255,255,.16)` | the kind and confirmation chips on the violet header | 1112–1113 |
| `rgba(255,255,255,.08)` | the disabled tick's chip fill on the violet header | 5067 |
| `rgba(255,255,255,.2)` | the disabled tick's outer border on the violet header | 5069 |
| `44px` | the constant's big value type size (`--fs-numeral` is 46px, a different role) | 1148 |
| `880px` | the detail column measure (`--width-doc` 860, `--width-summary` 960) | 1109 |
| `1.7fr .8fr .9fr 1.1fr 1.1fr 34px` | the facts list grid (a `--grid-facts` sibling of `--grid-users` / `--grid-audit` / `--grid-activity`) | 1036, 1051 |
| `1.6fr .8fr 1fr` | the columns table grid | 1372, 1377 |
| `1fr 1fr 1.2fr` | the edge-cases grid | 1659, 1663 |
| `minmax(120px,1fr)` / `minmax(110px,1fr)` / `minmax(140px,1fr)` | decision-table and record-grid track floors | 4854, 4899 |
| `2.15` | the statement's line-height | 1130 |
| `1.55` | the detail title's line-height | 1119 |
| `1.95` / `2` | «هر ردیف یعنی» and the tracked-reason line-heights | 1460, 1610 |
| `212px` | the filter menu's scroll cap (`--height-popover` is 280px, the dialogs' cap) | 1021 |
| `z-index:37` / `z-index:62` | the filter menu and the facts dialog (the token ladder has `--z-dropdown:1000` and `--z-modal:1055`; the design's raw numbers are a *different scale*, not a different intent — map to the tokens, and this row records that they were not equal) | 1021, 1754 |

**The detail screen's own rows, filed by Task 23 and folded in here 2026-09-01
(Task 24) so this table is the whole list rather than the list as of Task 21.**
Every line number below was re-derived by grep in Task 23's fix round 4; the
values are unchanged. None is minted — each is written exact and inline in
`cards/parts.tsx`'s `PX`, with its design line beside it.

| value | role | design line |
|---|---|---|
| `20px` | **the one worth the owner's attention** — the detail screen's commonest card padding, at five sites; `tokens.css` already records that `20px` has four owners, none of them a card | 1404, 1409, 1557, 1566, 1674 |
| `9px` | the header chip row's gutter, and the tick's | 1111, 1121 |
| `7px` | the printed-row detail column's gutter; a foreign-key and a reconciliation row's block padding | 1415, 1530, 1543 |
| `7px` / `9px` margin-top | under a title line; the printed row's detail block | 1294, 1415 |
| `11px 16px` | the confirm tick's box | 1121 |
| `20px 22px` | the statement card | 1129 |
| `9px` margin | an eyebrow's gap to its sentence | 1130 |
| `13px` | a rule's gap inside a card (aliases, the constant's «برای») | 1133, 1158 |
| `11px` margin | the constant's second sub-row | 1164 |
| `7px 12px` | a chip button, and an item's pack chip | 1270, 1594 |
| `11px 18px` | one source row | 1710 |
| `24px` | the constant card | 1143 |
| `18px 20px` | the formula block | 1179 |
| `15px 18px` | a counted table's head band | 1185, 1344, 1370 |
| `11px 12px` | one body cell of a grid | 1199, 1358, 1379 |
| `.55` | a retired printed row's opacity | 1409 |
| `110px` | the process row's name cell floor | 1723 |
| `70 / 96 / 104 / 110 / 120px` | the five label-column widths | 1159, 1324, 1418, 1567, 1229 |
| `4px` | the statement card's inline-start edge | 1129 |

---

## 3. Conformance-note deltas, as concrete component requirements

Each row is what a component must do *instead of* what the design does.

| note | the design does | the implementation must |
|---|---|---|
| 1 | `factRow` (4650–4653) emits only `chipLabel/chipFg/dot/staleStrike`; the `r.hasNote` slot at 1063–1064 is never populated | populate that slot: red counts «{n} بی‌پاسخ · {n} متعارض» from the served `red_counts`, and «پیش‌ثبت» / «بازنشسته» badges from `stub` / `retired`. Chip stays two-valued and carries none of it |
| 2 | Persian titles from the inline `KEY_FA` (4696), `UNIT_FA` (4680), `GROUP_FA` (4684), `ENUM_FA` (4688), `WD_FA`, `NATURE_FA`, `LEAF_FA` (4716) dictionaries | take titles from the served data: `inputs[].title` / `outputs[].title` / `fields[].title` / `unit_title`, and the bundle's `resolved` / `row_titles` / `path_labels`. Measurement «ثبت در» renders the record's title and the column title, not `F-00011 end_stock` (design: 5027 renders `sfMeasWrId` + `sfMeasWrField` raw) |
| 3 | `sfRecFields` (4978–4980) paints «واحد ثبت نشده» red on **every** numeric column without a `unit` when `role` is not `config`/`reference` | red is the served `red_paths` and nothing else. An omitted `unit` is "not applicable"; only `unit: null` is «بی‌پاسخ» |
| 4 | `sfAccounts` (5031) is a flat list of open accounts, no grouping, no `speaker_role` | group by disputed field under the field's `path_labels` label; show `speaker_role` on each account |
| 5 | the list shows every entry to every role (`shownFacts`, 4644) | the list is what the server serves — `may_serve`-filtered for an admin (QF-23). The client filters nothing on visibility |
| 6 | «محل» (1452–1454) puts `sfRecLocExtra` — «شناسهٔ فایل {spreadsheetId}» — a Persian label inside an `dir="ltr"` mono span | the «محل» row carries no bidi mix; the spreadsheet id lives in the footer chip only |
| 7 | only the tombstoned-process class is drawn (`p.tomb`, 1723) | draw every orphan class of Appendix D: «ارجاع بی‌مقصد», «منبع تغییرکرده», «اشاره به فرایند بازنشسته (جایگزین: {heir})», «گرهٔ ارجاع‌شده حذف شده» (the last from the bundle's `processes[].missing_nodes`) |
| 8 | `excRows`/`sfHasExceptions`/`sfFields` (4675, 5044–5045) are computed and **rendered nowhere** | draw the `field_status` markers («استنباطی» / «عرفی») on the field; an issue shows its `from_date`, `fix` and `affects`. `original` / `original_ref` become a collapsed, closed-by-default «متن اصلی» block in the «نام تابع» card — **approved by the user 2026-08-31, §6.1** |
| 9 | inline maps everywhere: `FKIND`, `FROLE`, `FLANG`, `FCADENCE`, `FMEDIUM`, `FSRC`, `FCAT`, `FQTY`, `FNATURE`, `FST`, `FSTFG`, `FISSUE` (3304–3318), plus the seven dictionaries note 2 names, plus `DEPT_FA` (4632) and `BRANCH_FA` (4633) | labels come from `ui/src/lib/factsLabels.ts` and the registries — departments from the existing department registry, branches from `GET /api/facts/branches`, units from the units record. No inline map in a component |
| 10 | six «کاربرگ‌ها» blocks (265, 407, 1074, 2105, 2683, 2914) and the inline `BOOKS`/`FACTS` arrays are still in the file | do not build any of it. There is no workbook screen in v1; their presence in the design file is not authority |

Two more corrections the notes imply and the design shows plainly:

* **Confirmation is per entry and two-state, and the client never computes a
  fingerprint.** The design keys confirmation by *viewer*
  (`VIEWER = isEditor ? 'editor_star' : 'cooking_editor'`, 4623;
  `(r.confirmation || {})[VIEWER]`, 4629) and carries the states
  `universal`, `stub`, `red_disputed`, `red_unknown` through `sfCanTick` and
  the tick palette (5062–5070) even though `CONF_KEYS` admits only two. The
  served shape is one boolean `confirmed` plus `can_confirm` plus a
  `fingerprint` to echo. The tick's *palette* is still the design's — the red
  variant is drawn when `can_confirm` is false because the entry is red, and
  no control is drawn at all when the caller cannot confirm.
* **`stOf`'s local override store** (`s.factConf`, `s.factRes`) is mock
  state. The real screens read the server and invalidate.

---

## 4. The computed-but-unrendered sweep

Every binding the facts block (4796–5079) exposes to the template, grepped
against the whole file for a consuming `{{ … }}` node. Method:
`scratchpad/sweep.py` + `sweep2.py` (regex over the file, member-level pass for
the five object bindings). 155 bindings; 145 rendered.

**The NOT RENDERED rows — the whole point of the sweep:**

| binding | defined | verdict |
|---|---|---|
| `factsCoverage` (4798) | `(s.fCov || {}).label` — the mock supplies «۱۹ از ۲۸ کاربرگ خوانده شده» | **no consuming node anywhere in the file.** §14 puts the coverage line in the list header; the user **REFUSED** it (§6, C1). The design is right as it stands — do not draw, do not re-propose |
| `factCount` (4809) | `toFa(shownFacts.length)` | no consuming node. Nothing in the spec asks for a result count either → dead in the design, do not draw |
| `filtersDisplay` (4811) | the constant string `'flex'` | dead constant, do not carry it forward |
| `sfDot` (4819) | `enConf.dot` | the detail header chip has no dot in the markup (only the list row does). Dead → do not draw |
| `sfHasOriginalRef` / `sfOriginalRef` (4883) | `rl.original_ref` | no consuming node. Note 8 wants them reachable and the user **approved** the block → **draw it** (§6.1) |
| `sfOriginalNote` (4885) | «بدنهٔ اسکریپت عیناً در همین فایل نگه داشته شده است.» etc. | no consuming node. Same block, same approval (§6.1) |
| `sfItemCodeAbsent` (5004) | `d.code_absent` | not consumed as a flag; the fallback string «بدون کد» is inlined into `sfItem.code` (5006) instead, which **is** rendered. Not a gap — the state is drawn, by another route |
| `sfHasExceptions` (5044) | `excRows.length > 0` | no consuming node |
| `sfFields` (5045) | the per-path list with `stLabel` / `stFg` / `dotBg` — red paths **and** `field_status` | no consuming node. **This is exactly the failure conformance note 8 records.** Note 8 corrects it → the `field_status` markers get drawn |
| `sfRec.medium` / `sfRec.role` (4896) | `FMEDIUM` / `FROLE` labels | computed, never rendered. `sfKind` (4814) already folds `role` into the header chip («جدول ثبت» etc., Appendix D's "shown as, by shape"), so `role` is covered by another route. **`medium` is not shown anywhere** — and Appendix D gives it labels. The user **approved** appending it to the kind·role line → **draw it** (§6.2) |

Member-level dead values inside rendered maps (smaller, recorded for
completeness — none of them is a state the design draws by another route, and
none is required by a conformance note, so **none is built**):
`sfOutputs[].nature` (the raw label; `naturePhrase` is what renders),
`sfOutputs[].share` (only `sharePct` / `hasShare` render),
`sfLogRows[].hasUnitRaw` / `unitRaw` (folded into `unitPhrase`),
`sfRecFks[].target` (only `targetTitle` / `targetFields` render),
`sfRecRecon[].against` (only `againstTitle`), `sfRecRows[].cells[].isRef` and
`sfTblRows[].cells[].head` (both used as internal flags, not rendered).

**The 145 rendered bindings**, for the record, resolve as:
list — `isFacts` 999, `factFilters` 1014, `hasFactFilters` 1032,
`clearFactFilters` 1033, `factQ` 1008, `factsEmpty` 1046, `factRows` 1050;
detail — `isFactDetail` 1107, `sfKind` 1112, chip 1113, `sfScopeLine` 1114,
`sfIsPort` 1115, `sfIsRetired` 1116, tick 1120–1125, `sf.title` 1119,
statement 1131, aliases 1132–1135, constant 1142–1170, formula 1174–1179,
decision table 1183–1207, lifecycle 1213–1241, identifier 1246–1249,
template 1255–1260, calls 1265–1269, I/O 1278–1336, record grid 1342–1360,
columns 1368–1391, log rows 1402–1440, structure 1448–1548, item 1554–1612,
measurement 1618–1652, edges 1656–1667, accounts 1673–1687, issues 1695–1697,
sources 1709–1713, processes 1718–1725, consumers 1730–1735,
footer 1742–1746, `sfUpdatedAt` 1746; dialog — `factAsk` 1754.

---

## 5. Rendered-but-never-computed — the mirror-image gap

`{{ r.hasNote }}` (1063) and `{{ r.noteLine }}` (1064) are markup nodes on the
list row. `factRow` (4650–4653) never emits either key, so the node is dead in
the design as it stands. The **data is already in the mock** —
`mock/facts/api/list.json` rows carry `red_counts: {unknown, disputed}`,
`stub` and `retired` — and the served row (Task 19) carries the same three.

So the design drew the slot, held the data, and did not wire it. That is
conformance note 1 stated as a defect. The note is what fills it, and the
slot's own type ramp (`10.5px`, `#a99fc4`, `margin-top:4px`, one ellipsised
line) is the design's answer to *how* it should look.

The counterpart values, from Appendix D: «{n} بی‌پاسخ» · «{n} متعارض»,
«پیش‌ثبت», «بازنشسته».

---

## 6. The five consult items — **answered by the user, 2026-08-31**

**These are decisions, not open questions. Nothing here is to be re-proposed.**
Two are refused and stay undrawn; two are approved deltas and are authority for
Tasks 22–24, to be built exactly as described; one was settled without a
re-ask.

| # | item | decision | what that means for the build |
|---|---|---|---|
| C1 | the coverage line in the list header — «{n} از {m} کاربرگ خوانده شده» | **REFUSED** | Do not draw it. The number stays served by `GET /api/facts` → `coverage` and goes unrendered, which is exactly what the design does with `factsCoverage` (4798). `SCREEN_LABELS.coverage` stays in `factsLabels.ts` because Appendix D declares it; no component reads it. **Do not re-propose.** |
| C2 | the raw-JSON view — «نمای خام (فقط‌خواندنی)» | **REFUSED** | Do not draw it. It is a developer's debugging aid with English field names and adds nothing to running the restaurant; the panel stays fully Persian with no developer surface. `SCREEN_LABELS.raw_view` stays for the same reason as C1. **Do not re-propose.** |
| C3 | the «متن اصلی» block (`original` / `original_ref`) | **APPROVED** — see the delta below | Build it. |
| C5 | `record.medium` | **APPROVED** — see the delta below | Build it. |
| C4 | «خارج از دسترسی شما» | **SETTLED** — the user approved this exact wording on 2026-08-31 when she chose the masked-neighbour option whose preview carried it | The copy is authority. It is now in `SCREEN_LABELS.restricted_neighbour` and has been added to spec Appendix D under *Screens, row classes and actions* — `routers/facts.py:345` already promises the string is "the UI's, rendered from `lib/factsLabels.ts`", and a string the UI ships must live in the authority file. |

### 6.1 Approved delta — the «متن اصلی» block (C3, conformance note 8)

A **collapsed, closed-by-default** block on the detail page holding `original`
and `original_ref`. The user's reason, in her terms: seeing exactly what was
said when a number looks wrong.

This satisfies note 8's "reachable as a collapsed «متن اصلی» block", and its
data is three of the ten NOT RENDERED bindings — `sfHasOriginalRef` /
`sfOriginalRef` (4883) and `sfOriginalNote` (4885). It belongs in the card the
design already draws for «نام تابع» (markup 1243–1252), which is the only other
consumer of `rl.original*`; the label is `PAYLOAD_FIELD_LABELS.original`
(«متن اصلی»).

Closed by default is part of the decision, not a detail: the block holds a raw
formula or script body, which is the one place §17 lets keys stand on their own,
and it must not push the entry's Persian off the first screen.

### 6.2 Approved delta — `record.medium` (C5)

Appended to the line that **already** carries the kind and the role, using the
same «·» separator that line already uses:

> «جدول/فرم · دفتر ثبت · برگهٔ کاغذی»

That line is `sfKind` (4814), which today emits `FKIND[kind]` plus
`' · ' + FROLE[role]` for a record. The delta adds a third segment,
`MEDIUM_LABELS[medium]`, with the same separator. It is not a chip and not a
new row in the «ساختار و مکان جدول» card — the user placed it on the line that
already answers "what kind of thing is this".

### 6.3 The four later rulings, folded in 2026-09-01 (Task 24)

§6's five consult items are answered above and closed. Four more decisions were
taken *during* the build, are shipped, and belong in the same record — a reader
who takes this file as authority must not have to read three task reports to
find them.

| ruling | date | what it means |
|---|---|---|
| **The «متن اصلی» block is closed by default.** | 2026-08-31 (part of C3) | Not a detail: the block holds a raw formula or script body — the one place §17 lets keys stand on their own — and it must not push the entry's Persian off the first screen. Pinned by `e2e/fact-detail.spec.ts` › *«متن اصلی» is collapsed and closed until it is asked for*. |
| **`FieldStatusCard` sits between the accounts card and the issues card.** | Task 23 | The design draws no box for `field_status` at all (`sfFields`, :5045, is computed and rendered nowhere), so there is no markup to copy. The position is the design's own binding order — `sfFields` is defined immediately before `sfIssues` — and the box is the screen's plainest card: Appendix D's «وضعیت فیلدها» over one dot-plus-word row per marked path (F11). |
| **The clear-filters link is `--role-link-quiet`, not the `#E23D35` the design paints (:1033).** | ledger **L-06**, the owner's ruling on this exact control | Settled on semantics: *«`--conflict` is declared destructive and conflicts, and clearing a filter destroys nothing.»* `Users` already drew it this way and `User activity` drew it `--conflict`; the ruling settled the contradiction and the facts design repeats the losing variant. `roles.css:73` is the role name. |
| **Two greens minted: `--tile-ok2` (`#F1FAF5`) and `--border-ok2` (`#DDEFE5`).** | 2026-09-01, shown the rendered screen rather than the swatches | The outputs card's header must read as the paler band the design drew rather than flattening into the unit pills below it. Named on the `--tile-v2…--tile-v5` / `--tile-c2` ladder the palette already uses for "the paler second tint of this hue". Struck through in §2.1 rather than deleted, so this file still records what was asked and what was answered. The other three colour rows were shown in the same pass and **accepted as they are**. |

One more that is a *rounding* rather than a decision, recorded because it is
the closest call in the build: a pill's weight. The design writes `700` six
times and `600` seven for the same role, and R8's dominance rule takes the `600`
— **semibold pills everywhere** on these two screens.

---

## 7. The seed facts I was handed, verified against the file

| seed | verdict |
|---|---|
| `CONF` has exactly two states, `green`/`amber`, with those labels and colours; `stOf` folds everything else to `amber`; the «سه حالت» comment is stale | **confirmed**, 4624–4630 |
| List screen values (pad, max-width, radii, shadow, search, filter grid, clear-all, table grid, head, row, empty state, id cell) | **confirmed**, every value matches, 999–1072 |
| The list row has **no** confirm tick; the tick is on the detail screen only | **confirmed**. The row's six cells are title, id, kind, scope, the status block, the chevron (1052–1070). The tick is `sfCanTick` at 1120, and `this._factAct` at 5073 is its dialog handler. **Task 22 has no tick.** |
| `r.hasNote` / `r.noteLine` is the second line under the status cell, and the only drawn home for note 1's counts and badges | **confirmed as a node** (1063–1064) — **and the binding is missing** (`factRow`, 4650, emits neither). See §5. The node is real; the wiring is note 1's job |
| `factsCoverage` (4798) is computed and never rendered | **confirmed** — one occurrence in 5416 lines, its definition. Added to the consult list as C1 |
| `assets/facts/labels.json` → `fLabels` anticipates server-served labels | **confirmed**, `loadFacts` at 3880–3890 fetches it and `refTitle` (4742) prefers `bundle.resolved` → `en.resolved` → `s.fLabels` in that order — which is precisely note 2's direction |
| `isBooksTab` / «کاربرگ‌ها» are still in the file but note 10 deletes them | **confirmed** — six blocks (265, 407, 1074, 2105, 2683, 2914). Not built |

**No seed fact disagreed with the file.** The one refinement is the
`hasNote` row: the parent read it as "the drawn home", which it is — with the
addition that the design never populates it, which strengthens rather than
contradicts the reading.

---

## 8. What the design's inline maps did, and what replaces each

Recorded because note 9 deletes them and a later task will want to know what
was there.

| design map | line | replaced by |
|---|---|---|
| `this.FKIND` | 3304 | `KIND_LABELS` + `KIND_SHAPE_LABELS` |
| `this.FROLE` / `FMEDIUM` / `FCADENCE` / `FCAT` / `FQTY` / `FNATURE` / `FSRC` / `FISSUE` / `FLANG` | 3305–3318 | the same-named maps in `factsLabels.ts`. **`FNATURE` (3310) is shorter than Appendix D** — «استاندارد» / «مشاهده‌شده» against Appendix D's «استاندارد تعیین‌شده» / «مشاهده‌شده در عمل». The design's own `NATURE_FA` (4694) already carries the Appendix D wording and is preferred at render time (4837). Appendix D wins |
| `this.FST` / `this.FSTFG` | 3313 / 3317 | `FIELD_STATUS_LABELS` (the colours stay in the component, token-backed: `#1F8A5B` صریح, `#4A25A9` استنباطی, `#8A5A00` عرفی, `#E23D35` متعارض and بی‌پاسخ) |
| `CONF` | 4624 | `CONFIRMATION_LABELS` |
| `DEPT_FA` | 4632 | the department registry (`lib/departments.ts` / `GET /api/departments`) |
| `BRANCH_FA` | 4633 | `GET /api/facts/branches` |
| `UNIT_FA` / `unitFa` | 4680 | the units record served with the entry (`unit_title`) |
| `GROUP_FA` | 4684 | `resolved` / the group's own `title` |
| `ENUM_FA` / `WD_FA` / `enumFa` | 4688–4693 | the per-enumeration maps in `factsLabels.ts` |
| `NATURE_FA` | 4694 | `NATURE_LABELS` |
| `KEY_FA` / `keyFa` | 4696–4713 | served titles (`inputs[].title`, `outputs[].title`, `fields[].title`) — note 2 |
| `LEAF_FA` / `pathFa` | 4716–4730 | the bundle's `path_labels` |
| the four inline enum objects for `table.hit`, `table.aggregate`, `divergence`, `fields[].type` | 4850–4877, 4982 | `HIT_LABELS`, `AGGREGATE_LABELS`, `DIVERGENCE_LABELS`, `FIELD_TYPE_LABELS` |
| the inline `{ raw, cooked, frozen, prepared }` state map | 5011 | `STATE_LABELS` |
| the inline `WD` weekday map inside `sfLogRows` | 4928 | not in Appendix D; the served row's own text |

Formatters worth keeping (they are behaviour, not labels):
`toFa` for chrome counts and dates only (QF-42), `faNum` (Persian decimal
separator «٫», 4732), `jalali` (`fa-IR-u-ca-persian`, 4734).

---

## 9. Conformance closure — the test that fails when each note regresses

**Written by Task 24, 2026-09-01.** §3 says what each of spec §14's ten notes
requires *instead of* the design. This says what breaks when somebody undoes it.

**Every pin below was mutation-checked**, because a test that would still pass
with the behaviour removed is not a pin, and this plan has caught four tests
that asserted nothing — three of them by mutation. The «mutant killed» column
is the change that was actually made to the tree and the assertion that went
red; each mutant was reverted immediately after. A note this task could not pin
honestly says so, in its own row, with what is missing.

| # | the note demands | the test that fails if it regresses | mutant killed |
|---|---|---|---|
| **1** | the red counts and the two badges beside the two-value chip, never inside it | `ui/e2e/facts.spec.ts` › *facts — the design’s list on the violet field, at three widths*; `src/facts/FactsList.test.tsx` › *shows the red counts beside the chip, in Persian digits* / *badges a pre-registered and a retired entry* / *shows no count line at all for a row with nothing to say* | `noteLine()` stopped emitting counts and badges → e2e red at «۴ بی‌پاسخ» (`facts.spec.ts:195`) |
| **2** | Persian titles from the served data — `inputs[].title`, `unit_title`, `resolved` / `row_titles` / `path_labels`; «ثبت در» is the record’s title, not `F-00011 end_stock` | `src/facts/cards/MeasurementCard.test.tsx` › *renders «ثبت در» as the record’s title and the column, never as `F-00011 end_stock`*; `cards/RecordCard.test.tsx` › *shows a refItems cell as its resolved title, with the key as the tooltip*; `ui/e2e/fact-detail.spec.ts` › *the constant, the item and the measurement* | «ثبت در» drawn as the raw `writes_to.ref` (the design's `sfMeasWrId`, :5027) → e2e red at `fact-detail.spec.ts:583` |
| **3** | red is the served `red_paths` and nothing else; an omitted `unit` is "not applicable" | `src/facts/bundle.test.ts` › *reads red out of `red_paths` and out of nothing else*; `cards/RecordCard.test.tsx` › *paints «واحد ثبت نشده» on a present-and-null unit and NOT on an omitted one*; `ui/e2e/fact-detail.spec.ts` › *the paper form: printed rows, and only a null unit is red* | `missing` restored to the design's `sfRecFields` rule (:4978 — every numeric column with no unit) → e2e red, «واحد ثبت نشده» 2 → **3** |
| **4** | accounts grouped by disputed field under its `path_labels` label, each with `speaker_role` | `src/facts/cards/AccountsCard.test.tsx` › *groups the accounts by disputed field, under the field’s `path_labels` label* / *shows `speaker_role` on the account that has one*; `ui/e2e/fact-detail.spec.ts` › *the disputed rule: accounts grouped by field, and the resolve* | two mutants: the group's `aria-label` set to the raw path, and the speaker label dropped → both vitest tests red |
| **5** | an admin's list is `may_serve`-filtered (QF-23); the client filters nothing on visibility | `ui-backend/tests/test_facts_api.py::test_an_admins_list_omits_an_entry_with_no_valid_confirmation` (the list) and `::test_an_admin_is_404d_off_an_entry_with_no_valid_confirmation` (one entry) | two mutants: `may_serve_fact` removed from the list loop (`routers/facts.py:530`) → the first red; removed from `_servable` (`:232`) → the second red, with three more beside it. **The two sites are separate and each needed its own mutant** — the first attempt struck `_servable` and the list test stayed green |
| **6** | the «محل» row carries no bidi mix; the spreadsheet id lives in the footer chip only | `src/facts/cards/RecordCard.test.tsx` › *keeps the spreadsheet id out of the «محل» row — note 6*; `ui/e2e/fact-detail.spec.ts` › *the BOM grid paints red from `red_paths` and nothing else* (the id is asserted `toHaveCount(1)` over the whole page, then located in the footer) | `location.spreadsheetId` put back on the «محل» row → e2e red, id count 1 → **2** |
| **7** | every orphan class of Appendix D is drawn, not only the tombstoned process | `ui/e2e/fact-detail.spec.ts` › *the design’s screen on the violet field, at three widths* — «اشاره به فرایند بازنشسته (جایگزین: …)», «ارجاع بی‌مقصد», «گرهٔ ارجاع‌شده حذف شده», and the masked consumer with no press | the two classes the design does not draw returned to `undefined` → e2e red at `fact-detail.spec.ts:362` |
| **7b** | «منبع تغییرکرده» — the fourth class | **KNOWINGLY UNPINNED.** See below. | — |
| **8** | `field_status` markers drawn; `original` / `original_ref` reachable as a collapsed, closed «متن اصلی»; an issue shows `from_date`, `fix`, `affects` | `src/facts/cards/IssuesCard.test.tsx` › *shows the defect, its kind, and note 8’s `from_date`, `fix` and `affects`* and *the field-status card > draws a marker per `field_status` path, under the path’s Persian label*; `ui/e2e/fact-detail.spec.ts` › *«متن اصلی» is collapsed and closed until it is asked for* | three mutants: the three issue fields gated off → the issues test red; `FieldStatusCard` returning `null` always → the field-status test red; `useState(true)` on the disclosure → e2e red, `aria-expanded` `false` → **`true`** |
| **9** | labels come from `lib/factsLabels.ts` and the registries — no inline map in a component | **NEW, Task 24:** `src/test/guards.test.ts` › *§14 note 9 — the facts screens hold no Persian of their own > no file under src/facts/ writes a Persian string*. Beside it: `src/lib/factsLabels.test.ts` › *every enum member and const the three schemas declare has a Persian label* (the file is complete) and `src/facts/FactsList.test.tsx` › *writes the scope from the two registries, never from an inline map* | `const SOURCE_FA = { sheet: 'کاربرگ' }` added to `cards/RuleCard.tsx` → the guard red. **Nothing pinned this before**: the labels test proves `factsLabels.ts` is complete, and completeness says nothing about whether a card grew a map of its own beside it |
| **10** | no workbook screen in v1; the six «کاربرگ‌ها» blocks and the inline `BOOKS`/`FACTS` arrays are not built | **NEW, Task 24:** `src/routes.test.tsx` › *has no workbook screen — the app’s route surface is this list (note 10)* | `{ path: '/workbooks', … }` added to `appRoutes` → red. Asserted over the WHOLE route list rather than the two paths that say «fact», because a workbook screen is as likely to be spelled `/workbooks` |

### 9.1 The one note that is knowingly unpinned, and the request that would fix it

**Note 7's «منبع تغییرکرده» is a backend gap, not a screen gap, and no
client-side heuristic may stand in for it.**

`merge facts audit`/`check` already computes it: `engine/merge_facts/audit.py`
compares each `source[].hash` against the file on disk and emits a
`source_moved` finding when they differ (or when a non-estate `ref` has gone).
Nothing carries that verdict through to the Panel — `FactSource.hash` is *what
was read*, not what is there now, and the bundle has no field that says a source
has moved. `SCREEN_LABELS.moved_source` («منبع تغییرکرده») is in
`factsLabels.ts` because Appendix D declares it, and no component reads it.

**The request, written out so it can be picked up whole.**

> `GET /api/facts/{fid}` gains one flag per source — `source[].moved: boolean` —
> set by the same comparison `audit.py` makes (`sha256_file(path) != held`, and
> `True` for a non-estate `ref` that is no longer a file). The source row then
> draws `SCREEN_LABELS.moved_source` as a warn pill, exactly as the three
> process-link orphan classes are drawn one card down, and a test in
> `SourceRow.test.tsx` pins it. Estate workbooks are outside git (QF-28) and
> their absence is `estate_absent`, not `source_moved`, so the flag must keep
> that distinction rather than reporting every missing workbook as moved.

Until that field is served, this note stays open and this row stays honest.

### 9.2 A proposed ELEVENTH note — the owner's to accept or reject

**Carried forward from Task 23's report §5.9. It is not accepted, it is not
implemented as though accepted, and it is not dropped.**

> **Proposed note 11.** A record's rows are printed items on a form, not data,
> whenever every key they carry is a bookkeeping key — even where a declared
> column happens to be *named* like one. `recHasGrid`'s middle disjunct
> (`Inja Panel.dc.html:4667`) asks only whether a row has a value under some
> declared column key, and answers "grid" on a coincidence of names.

**The evidence, as measured.**

* The design's expression is `(r.cells||[]).length > 0 ||
  recFieldKeys.some(k => r[k] !== undefined) ||
  Object.keys(r).some(k => !LOGKEYS[k])`.
* Its middle disjunct is a strict SUBSET of its third, **except** where the
  column keys and the bookkeeping keys overlap.
* `F-00012` («درخواست کالا بخش کانتر آشپزخانه», a paper request form) is that
  overlap: its columns are `item / unit / requested / delivered /
  warehouse_tick`, and each of its four printed rows carries a bookkeeping
  `unit`. Under the design's own expression the form draws as a **grid** —
  four rows by five columns, four of them «؟» — and «قلم‌های چاپ‌شده روی فرم»
  is suppressed with everything on it.
* **The design contradicts itself here and its own comment is the tiebreaker.**
  `:4664` reads «ردیف فرم فقط کلیدهای دفترداری دارد» — *a form's row has only
  bookkeeping keys* — which is the third disjunct exactly, and is what the build
  implements.
* **Blast radius, measured rather than assumed** (and reproduced independently
  by Task 23's reviewer): `F-00012` is the **only** entry in the whole mock
  where the two expressions disagree.

**What the tree does today:** `hasGrid` in `cards/RecordCard.tsx` is the two
disjuncts that agree with the design's comment, with the middle one left out,
and it is pinned by `RecordCard.test.tsx` › *reads a paper form with a column
keyed `unit` as a form, not a grid*.

**The one-line reversal, if the owner rejects the note:** add
`|| (d.fields ?? []).some((f) => (d.rows ?? []).some((r) => r[f.key] !== undefined))`
to `hasGrid`, and delete that test. Nothing else moves.

### 9.3 What Task 24 added, beyond the two new note pins

| pin | what it stops | mutant killed |
|---|---|---|
| `ui/e2e/facts.spec.ts` — `column-gap: 7px` on the status-dot row | the one untokenised value on the list that nothing pinned, while its sibling (the `fr` ratios) was asserted | `style={{ gap: '7px' }}` → `gap-s3` → red, `7px` → **`6px`**: the exact substitution the code comment warns about |
| `ui/e2e/facts.spec.ts` — `border-radius: 50%` on the chevron disc | a 30px violet **square** where the design draws a disc; every other assertion on that element still passes | `rounded-round` → `rounded-md` → red, `50%` → **`6px`** |
| `src/facts/cards/AccountsCard.test.tsx` — *names where each account was read, in the design’s own phrase* | the account card's source line, which was covered only by proxy in `SourceRow.test.tsx` — the same `sourceAt` + `Filled` pair (:5033), drawn from a different card | the `Filled` render dropped → red |
| `ui/e2e/sweep.spec.ts` — `sweep — factDetail` | the detail screen was **not** in the cross-screen sweep: the field, Vazirmatn, RTL, a sideways scroll at 760, a latin digit outside a declared island, a console error | (not a mutation pin — it is the cross-screen sweep, whose own six checks are each a defect that shipped on other screens) |

### 9.4 Where the mutation pass found the pins weaker than assumed

* **Note 5 has two sites, not one.** Striking `may_serve_fact` out of
  `_servable` (`routers/facts.py:232`) left
  `test_an_admins_list_omits_an_entry_with_no_valid_confirmation` **green** —
  that predicate answers the bundle and its neighbours, and the list route makes
  its own call at `:530`. Both are pinned; each needed its own mutant to say so.
* **Note 9 had no pin at all before this task**, only a completeness test for
  the label file, which a component with its own inline map passes.
* **Note 10 had no pin at all before this task.** Nothing failed when a screen
  was added.
