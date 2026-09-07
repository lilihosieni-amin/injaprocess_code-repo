"""`facts-plan` — the deterministic half of the facts pipeline (spec §2.3–§2.7).

`build` reads the dumps and writes candidates with every mechanical field
already filled (QF-46); `assemble` folds the units' decisions back into the one
delta `merge facts apply` understands. Nothing here writes to the store, and
nothing here asks a model anything.

`facts_plan` imports `merge_facts`; never the reverse.

The package re-exports nothing: `assemble.validate_unit` (`validate
facts-unit`) is imported from `facts_plan.assemble` by the two callers that
want it (`validate.cli`, `facts_plan.cli.unit_states`), and an eager
re-export here would drag `build`'s dump readers into every
`import facts_plan`.
"""
