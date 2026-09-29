# Comments — Every Author, and the Way Back from a Withdrawal

| | |
|---|---|
| **Date** | 2026-09-29 |
| **Status** | Decided by lili, 2026-09-29, on a real user's report |
| **Amends** | `2026-08-04-multi-user-rbac-design.md` — **D11**'s "the Editor is offered no composer", **D33**'s lifecycle and **D36**; `2026-09-21-comments-routing-addendum.md` — **D63.5** and D63's closing line, **§7.2**, **D73**'s restatement of D36, and **D74**, which is withdrawn |
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
an Editor wants kept with the process, visible to Admins and Readers on the
path, and closed by `addressed` like any other. The capability was always held
(D11's nesting argument stands); only the refusal is withdrawn.

### B — Every author controls their comment until someone else acts on it

`edit` and `withdraw` are offered to the author while the comment is
`awaiting` **or** `approved` **and** nobody has approved it since the last
restart. This replaces D36's table as D73 restated it.

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
metrics, at the foot of the comment.

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

*Why:* a withdrawal is the author's own act, so the author may undo it. A
rejection is someone else's decision and stays final (D73).

## 3. D33's lifecycle, as it now reads

`withdrawn` is no longer terminal **for its author**: it leads back to
`awaiting` or `approved` through `restored`. `rejected` and `addressed` remain
final. Nothing is hard-deleted, as before.
