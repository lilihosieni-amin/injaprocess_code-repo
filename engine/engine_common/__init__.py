import json
import os
import pathlib
import re
import tempfile

from jsonschema import Draft202012Validator


def data_root():
    r = os.environ.get("DATA_ROOT")
    if not r:
        raise SystemExit("DATA_ROOT is not set")
    return pathlib.Path(r)


def schema_dir():
    d = os.environ.get("SCHEMA_DIR")
    if d:
        return pathlib.Path(d)
    # engine/engine_common/__init__.py -> parents[2] == code-repo root
    return pathlib.Path(__file__).resolve().parents[2] / "schemas"


def under(path, base):
    """Is `path` inside `base`, once both are resolved?

    The containment test every CLI that turns a caller-supplied string into a
    filesystem location owes DATA_ROOT — `merge facts export`'s `--out` and
    `extract-attachment`'s `--path`. Resolved on both sides, so `..` and a
    symlink are answered rather than spelled around.
    """
    try:
        pathlib.Path(path).resolve().relative_to(pathlib.Path(base).resolve())
        return True
    except ValueError:
        return False


def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path, obj):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def write_text_atomic(path, text):
    """Same guarantee as write_json_atomic, for plain text (transcripts).

    A killed process must never leave a partial transcript at the destination —
    the idempotency pre-check would later read it as a finished one.
    """
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return path


_VALIDATORS = {}
_SCHEMAS = {}

#: Every integer index of a rendered path, so two entries breaking one rule
#: group onto one line (§3.4).
_INDEX_RE = re.compile(r"\[[0-9]+\]")

#: §3.4's ceiling: a pathological document stays readable.
LINE_CAP = 80


def capped(lines):
    """§3.4's ceiling applied to any list of refusals: the first `LINE_CAP`,
    then how many were left. One implementation, so the schema half and the
    content half of a gate cannot cap differently (or one of them not at all).
    """
    return lines[:LINE_CAP] + [f"… and {len(lines) - LINE_CAP} more"] \
        if len(lines) > LINE_CAP else lines


def _path(parts):
    """A jsonschema error path as `entries[3].data.fields[2].type`."""
    out = ""
    for part in parts:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else part)
    return out or "<document>"


def _entry_branches(schema):
    """The per-kind branches of `$defs.entry`'s `oneOf`, found by scanning the
    `allOf` — `facts.schema.json` has two members and `facts-delta.schema.json`
    three, so the index is not the same in both files."""
    for member in (schema.get("$defs", {}).get("entry", {}).get("allOf") or []):
        if "oneOf" in member:
            return member["oneOf"]
    return []


def _branch_of(schema, entry):
    """The branch whose `kind` matches this entry's, as a schema of its own.
    `$defs` travels with it so its `#/$defs/…` refs still resolve."""
    for branch in _entry_branches(schema):
        kind = branch.get("properties", {}).get("kind", {})
        if entry.get("kind") in ([kind["const"]] if "const" in kind
                                 else kind.get("enum") or []):
            return {**branch, "$defs": schema["$defs"],
                    "$schema": schema["$schema"]}
    return None


def _expand(schema, instance, errors):
    """`[(path, message)]` — an `entries[N]` that fails `oneOf` says only that
    the whole entry matched nothing, and its `message` is the entry dumped. It
    is re-validated against the branch of its own `kind` so the failure is
    reported where it is: `entries[3].data.fields[2].type`."""
    out = []
    for error in errors:
        entry = (instance["entries"][error.path[1]]
                 if error.validator == "oneOf" and len(error.path) == 2
                 and error.path[0] == "entries" else None)
        if not isinstance(entry, dict):
            # A non-object entry (a stray string in `entries`) matches every
            # branch's `properties` vacuously, so `oneOf` fails with "valid
            # under each of". It has no `kind` to look a branch up by: keep
            # jsonschema's own message rather than asking a str for one.
            entry = None
        branch = _branch_of(schema, entry) if entry is not None else None
        found = list(Draft202012Validator(branch).iter_errors(entry)) if branch else []
        if found:
            out += [(_path(list(error.path) + list(f.path)), f.message) for f in found]
        elif entry is not None:
            out.append((_path(error.path),
                        f"kind {entry.get('kind')!r} matches no payload shape"))
        else:
            out.append((_path(error.path), error.message))
    return out


def _error_lines(schema, instance, errors):
    """One line per distinct `(path with its indices generalised, rule)`, with
    the count and the first three concrete paths (§3.4)."""
    groups = {}
    for path, message in _expand(schema, instance, errors):
        groups.setdefault((_INDEX_RE.sub("[N]", path), message), []).append(path)
    return capped([f"{paths[0]}: {message}" if len(paths) == 1 else
                   f"{generic}: {message} ({len(paths)} places: "
                   f"{', '.join(paths[:3])})"
                   for (generic, message), paths in groups.items()])


def validate(schema_name, instance):
    v = _VALIDATORS.get(schema_name)
    if v is None:
        schema = read_json(schema_dir() / schema_name)
        Draft202012Validator.check_schema(schema)
        v = Draft202012Validator(schema)
        _VALIDATORS[schema_name], _SCHEMAS[schema_name] = v, schema
    # Sorted by the RENDERED path, not by `list(e.path)`: a path mixes `str`
    # and `int` members, and comparing `['entries', 0]` against
    # `['schema_version']` is a TypeError waiting for the first document that
    # breaks a top-level rule and an entry rule at once.
    errors = sorted(v.iter_errors(instance), key=lambda e: _path(e.path))
    if errors:
        lines = _error_lines(_SCHEMAS[schema_name], instance, errors)
        raise ValueError(f"{schema_name} validation failed:\n" + "\n".join(lines))


def is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, dict):
        return all(is_empty(v) for v in value.values())
    if isinstance(value, list):
        return len(value) == 0
    return False
