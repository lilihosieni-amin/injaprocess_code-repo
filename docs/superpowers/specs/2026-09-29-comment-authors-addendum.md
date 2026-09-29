# Comments — Every Author, and the Way Back from a Withdrawal

| | |
|---|---|
| **Date** | 2026-09-29 |
| **Status** | Decided by lili, 2026-09-29, on a real user's report |
| **Amends** | `2026-08-04-multi-user-rbac-design.md` — **D11**'s "the Editor is offered no composer", **D33**'s lifecycle, **D36**, and **D42**'s event catalogue; `2026-09-21-comments-routing-addendum.md` — **D63.5** and D63's closing line, **§7.2**, **D73**'s restatement of D36, and **D74**, which is withdrawn; `2026-09-27-activity-record-addendum.md` — **D76**, the catalogue as built, which gains `comment.restored`; the Panel design's editor inbox tabs (`Inja Panel.dc.html` L4192) |
| **Unchanged** | Routing for a Reader (D63.1–D63.4, D63.6–D63.8), D64–D72, D75; `rejected` stays final (D73) |
| **Schema** | None changed. `comment_events.kind` is plain `TEXT`; a comment sent again returns to `awaiting` or `approved`, which already exist |

---

## 1. Why

A user reported three things the comment system would not let them do: an
Editor could not write a comment; an Admin or an Editor could not edit or
withdraw one they had written; and nobody could take back a withdrawal. The
first was deliberate (D11, D74). The second fell out of a rule written for
Readers: the author's window was "awaiting, and nobody has approved since the
last restart" — and an Admin's comment is never `awaiting`, it is `approved`
at submission (D63.5). The third was D33: `withdrawn` was terminal.

## 2. The decisions

### A — An Editor's comment lands ready to act on

An Editor may write a comment. Like an Admin's (D63.5), it skips routing and
arrives `approved` in the Editors' inbox. D74's server refusal and §7.2's
hidden composer both go; the composer's path line says
«این کامنت مستقیم به ادیتور می‌رود.» to Admins and Editors alike.

*Why:* D11 called an Editor's comment "meaningless rather than forbidden",
because it would land in their own inbox. It is not meaningless — it is a note
an Editor wants kept with the process, visible to every Editor and to the
Admins whose scope covers its department (D66), and closed by `addressed` like
any other. No Reader sees it: a Reader sees only what they wrote or were
assigned, and an Editor's comment is never assigned to anyone. The capability was always held
(D11's nesting argument stands); only the refusal is withdrawn.

### B — Every author controls their comment until someone else acts on it

`edit` and `withdraw` are offered to the author while the comment is
`awaiting` **or** `approved` **and** nobody has approved it since the last
restart. This replaces D36's table as D73 restated it.

`edit` also asks, now, for what creating the comment asked for: `comment` on
its department (D48 — every action re-derives permission). An author whose
scope or role no longer allows it is refused with 403 and `access.denied`.
`withdraw` asks for nothing more: taking one's own words back never needs a
permission.

*Why the predicate is right:* approvals since the last restart are the only act
by someone else that leaves a comment open; addressing, rejecting and
withdrawing each move it to a state of its own. So a Reader's comment drops out
at its first approval, and an Admin's or an Editor's — `approved` with no
approval at all — stays theirs until an Editor addresses it. D36's reason
stands unchanged: an approval vouches for specific words, and no signature is
ever overwritten.

*One case the brief did not name:* a Reader's comment delivered by D63.6 (no
covering Admin) is also `approved` with no approval. Nobody else has acted on
it, so the author keeps it — the same rule, not an exception.

The panel inbox now draws the author's controls. They are one component with
the Reader card's (`ui/src/comments/AuthorActions.tsx`), at each surface's own
metrics, at the foot of the comment. After an edit the toast says where the
comment landed: «اصلاح شد» when it is `approved` again at once,
«اصلاح شد و زنجیره از اول شروع شد» when it is back in the chain.

**The Editor's panel inbox gains «کامنت‌های من»** (lili, 2026-09-29), between
«رسیده به شما» and «همه», where the other kinds have it. This departs from the
Panel design (L4192), which left the tab out because an Editor wrote no
comments. Without it, a withdrawn Editor comment — where «ارسال دوباره» lives —
could be reached only by paging «همه», where closed comments sort last.

### C — Sending a withdrawn comment again restarts its journey

The author of a `withdrawn` comment may send it again («ارسال دوباره»,
`POST /api/comments/{ref}/restore`). It routes from the author through
`submit()`, exactly as an edit does (D73): a Reader's goes back to the first
approver, an Admin's or an Editor's lands `approved` again.

- A new event kind, **`restored`**, records it and counts as a restart in
  `approvers_since_restart`, beside `submitted` and `edited`. A new kind rather
  than a second `submitted`: the trail must say the comment was withdrawn and
  *then* sent again («دوباره فرستاده شد»), where a second `submitted` would
  read as a second, unrelated submission.
- A new audit event, **`comment.restored`** («ارسال دوبارهٔ کامنت»), in the
  record's catalogue under `governance` like the other `comment.*` events.
- The undo does not ask for confirmation; the withdrawal it undoes did.
- Sending again is commenting again, so it asks what creating asked: `comment`
  on the department (403 and `access.denied` when refused, as for `edit`), and
  the anchor must still stand and be served to the author — the same check,
  run by the same code, as creating (404 when it does not). A Reader's or an
  Admin's comment on a process tombstoned since is therefore not sent back;
  an Editor's is, because `Disclosure.may_serve` serves Editors a tombstoned
  process and creating a comment on one is allowed to them for the same reason.
- **Comments already `withdrawn` when this ships become sendable again by
  their authors.** Intended: the rule reads the state, not when the withdrawal
  happened.

*Why:* a withdrawal is the author's own act, so the author may undo it. A
rejection is someone else's decision and stays final (D73).

## 3. D33's lifecycle, as it now reads

`withdrawn` is no longer terminal **for its author**: it leads back to
`awaiting` or `approved` through `restored`. `rejected` and `addressed` remain
final. Nothing is hard-deleted, as before.

**Where `restored` is recorded.** The schema comment in `comments_db.py`
(lines 59–60) lists the event kinds and does not name `restored`. It sits inside
the frozen v1 migration string, which `tests/test_comments_contract.py` pins
byte for byte to `engine/tests/comments_schema_v1.sql`, so it is not edited;
this addendum is the record that `restored` is a kind.

## 4. Known limitation — the Telegram bot and an author's edit

`comments resolve` checks only `state == 'approved'`. An Admin's or an Editor's
comment is now theirs to change while it is `approved`, so an author who edits
it while the bot is working on it gets their **new** text marked addressed —
text the bot never read. (A withdrawal meanwhile is safe: `resolve` then finds
nothing and refuses.)

The smallest honest guard: `comments show` prints a version (the id of the
comment's latest event); `comments resolve` takes `--seen N` and refuses when
the version has moved; one line in data-repo's `CLAUDE.md` tells the bot to
pass it. **Deferred at the owner's decision** (lili, 2026-09-29); not built.

## 5. 2026-09-29, later — no Admin sees an Editor's comment

**Amends** D66, and D67's audience with it, for one kind of comment; replaces
decision A's *Why* where it says an Editor's comment is visible "to the Admins
whose scope covers its department". Decided by lili.

A comment **written as an Editor** is seen by the Editors, by its author, and
by anyone it was assigned to on an earlier pass — a Reader supervisor who saw
it keeps seeing how it ended (D38, D67) — and **never by an Admin**: not one
covering its department, not a `*` one. Every other row of D66 stands.

*Why:* an Editor's comment lands `approved` in the Editors' inbox and never
passes the Admin pool (decision A), so Admins have no part in its life.

- **Written as an Editor** means the latest of the comment's passes —
  `submitted`, `edited` or `restored` — records the role `editor` (D62
  snapshots the author's kind into each event's `detail`). Not the author's
  kind now: an Editor made an Admin later keeps seeing their own comment (the
  author check comes first) and does not open their untouched comments to the
  other Admins. A pass with no role recorded reads as not an Editor's.
  `submit()` reads the author's kind once and both records the pass with it
  and routes by it, so the two cannot disagree however the author is re-roled
  mid-request; the author's role a comment shows is that same latest pass's.
- *Why the latest pass, not only `submitted`:* every pass goes through
  `submit()`, which routes by the author's kind at that moment, so the latest
  pass's role is the one the comment's current path was decided on. A
  comment waiting on someone must be visible to them. Keyed on `submitted`
  alone, an Editor made a Reader who edited or sent their comment again sent
  it up the chain into an Admin pool whose Admins could not see it, and
  nobody could ever approve it. The reverse follows too: a Reader made an
  Editor who edits their comment makes it an Editor's, as it then lands
  `approved` without the pool.
- `can_see` and `visible_sql` state it — D66's one rule, stated twice — so the
  detail (the same 404 as any comment the caller may not see, no audit row),
  the inbox tabs, the drawers and the badges on steps, processes and
  departments all follow. The pending count (D68) had counted the Admin pool
  without asking `visible_sql`; it now asks.
- **The activity record is unchanged.** Its «مسیر کامنت‌ها» tab still lists
  such a comment to an Admin whose `view_audit` covers its department — its
  `CMT-n`, department, author, state and stage, never its text (D44) — and a
  `*` holder's one-user page still shows the Editor's `comment.*` events with
  their `CMT-n`. Left for the owner to decide.
- **Schema:** none changed, in `comments.db` or `app.db`. Only a comment whose
  latest pass records `editor` changes visibility, and the server refused
  Editor authors until decision A.
