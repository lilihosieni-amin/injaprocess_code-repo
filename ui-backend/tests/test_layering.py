"""The layering rule, pinned rather than restated (CLAUDE.md, ARD §1).

*All components communicate only through the filesystem; the ui-backend never
imports the engine package.* It is why `facts_store.iter_ref_objects` and
`facts_store._red` are reimplementations of `merge_facts`' own rather than
imports of them, and it is what lets the service be deployed and installed
without `inja-engine` anywhere near it — `deploy/` builds the two images
separately, and an import added here would not fail until the container ran.

Nothing pinned it before. This is one test, and it reads the engine's OWN
package list out of `engine/pyproject.toml` rather than repeating it, so an
eleventh engine package is covered the day it is declared.

Scope: `inja_ui_backend/**` — the shipped package. The TESTS may import the
engine (`test_facts_store.test_the_red_set_is_the_engines_own` pins the
reimplemented walk against the original, which is the one thing that cannot be
done from one side), because tests are not deployed and a test import cannot
put the engine on the service's dependency list.
"""
from __future__ import annotations

import ast
import pathlib
import tomllib

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_PACKAGE = _ROOT / "ui-backend" / "inja_ui_backend"


def _engine_packages() -> set[str]:
    """The engine's top-level importable names, from its own build config."""
    config = tomllib.loads(
        (_ROOT / "engine" / "pyproject.toml").read_text(encoding="utf-8"))
    include = config["tool"]["setuptools"]["packages"]["find"]["include"]
    return {name.rstrip("*") for name in include}


def _absolute_imports(path: pathlib.Path) -> set[str]:
    """Every top-level module name this file imports absolutely.

    `from .facts import _targets` and friends are relative (`level > 0`) and are
    this package's own — skipped, or every internal import would look external.
    """
    out: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            out.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
            out.add(node.module.split(".")[0])
    return out


def test_the_engine_package_list_is_the_one_being_read():
    """The guard's own guard: a `pyproject.toml` this stopped parsing would
    make every assertion below vacuous."""
    packages = _engine_packages()
    assert {"merge_facts", "engine_common", "allocate_id"} <= packages
    assert len(packages) >= 10


def test_the_ui_backend_imports_no_engine_package():
    files = sorted(_PACKAGE.rglob("*.py"))
    assert len(files) > 15, f"the scan found almost nothing: {files}"
    engine = _engine_packages()
    offenders = {
        str(path.relative_to(_ROOT)): sorted(_absolute_imports(path) & engine)
        for path in files
        if _absolute_imports(path) & engine
    }
    assert offenders == {}, (
        "the ui-backend must reach the engine through the filesystem only "
        f"(CLAUDE.md): {offenders}")
