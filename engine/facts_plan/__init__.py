"""`facts-plan` — the deterministic half of the facts pipeline (spec §2.3–§2.7).

`build` reads the dumps and writes candidates with every mechanical field
already filled (QF-46); `assemble` folds the units' decisions back into the one
delta `merge facts apply` understands. Nothing here writes to the store, and
nothing here asks a model anything.

`facts_plan` imports `merge_facts`; never the reverse.

The package re-exports nothing: `assemble.validate_unit` (`validate
facts-unit`) does not exist until T14 lands it, and an eager re-export here
would make `import facts_plan` fail until then. T14 adds the line if it wants
the short name.
"""
