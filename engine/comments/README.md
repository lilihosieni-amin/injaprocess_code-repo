# comments (deterministic CLI — implemented)

Console command: `comments` → `comments.cli:main`

The Telegram runtime's way into `comments.db` (spec D4, D39, D59). Reads and
writes that file by SQL only — it cannot import `ui-backend`, which owns and
migrates it (`comments_db.py`); `tests/test_comments_contract.py` pins that
the two sides agree on the schema. Sees only `approved` and `addressed`
comments; never reads a users table, since the author and trail are
denormalised in the file.

- `comments list --department D [--status approved|addressed]` — one line per
  comment, newest last; `--status` defaults to `approved`.
- `comments show CMT-n` — text, anchor, author and full event trail.
- `comments resolve CMT-n [--commit SHA] [--note TEXT]` — closes an approved
  comment (`state` → `addressed`), appends an `addressed` event stamped
  `agent:control-bot`, and appends a `comment.addressed` row to `outbox` for
  ui-backend's drain to pick up (no `actor` field — the drain stamps that).

Database: `--db PATH` or `$COMMENTS_DB`.

Exit 0 on success. Exit 2 on any refusal — an uninitialised or wrong-version
store, an unknown or not-visible `CMT-n`, or resolving one already
addressed — with `comments: …` on stderr.
