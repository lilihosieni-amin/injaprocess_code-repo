# Decision records (ADRs)

Short records of notable technical decisions and the problem/investigation that
led to them — so the *why* survives, not just the diff. One file per decision,
numbered, newest facts win.

| # | Decision |
|---|---|
| [0001](0001-control-bot-no-read-only-ac7-via-hooks.md) | control-bot runs without `read_only`; AC-7 is enforced by the Phase-3 hooks + `can_use_tool` callback, not the filesystem |
