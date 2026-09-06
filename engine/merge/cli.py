import argparse
import sys
from datetime import datetime, timezone

from engine_common import data_root, read_json, write_json_atomic
from merge import (attach_subprocess, build_new, build_update, remove_process,
                   resolve_pending, restructure)
from merge_facts import facts_dir
from merge_facts.apply import apply as apply_facts
from merge_facts.audit import audit as audit_facts
from merge_facts.audit import check as check_facts
from merge_facts.audit import coverage as facts_coverage
from merge_facts.revert import revert as revert_facts
from merge_facts.verbs import export as export_facts
from merge_facts.verbs import promote as promote_facts
from merge_facts.verbs import repair_foreign_keys as repair_facts_foreign_keys
from merge_facts.verbs import repair_source_refs as repair_facts_source_refs
from merge_facts.verbs import resolve as resolve_facts
from merge_facts.verbs import retire as retire_facts
from order import reconcile as reconcile_order


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dept_of(pid):
    return pid.rsplit("-", 1)[0]


def _proc_path(pid):
    return data_root() / "departments" / _dept_of(pid) / "processes" / f"{pid}.json"


def _sync_order(depts, now, heir_hints=None, child_hints=None):
    """Keep each touched department's order.json equal to its active set (§4.6).

    A failure here warns on stderr and lets the merge stand; it must never
    propagate. By the time we reach the sync the process files are written and
    the id ledger has advanced, so raising would let the `except ValueError` in
    `main` report a *fully applied* merge as exit 2 — this CLI's "precondition
    failed, nothing happened" code (see `_require`). A pipeline that retries on
    exit 2 would then re-run the verb and mint a duplicate process. Every
    realistic failure lands there: a corrupt order.json (`json.JSONDecodeError`
    is a `ValueError`), `read_order`'s malformed-shape `ValueError`, and
    `validate`'s.

    order.json is derived state — `order sync <dept>` rebuilds it from disk, and
    an unreadable one can simply be deleted first — so a warning still leaves a
    complete recovery path. It has to, because the hook widened merge's read
    surface: `active_ids` reads *every* process file in the department, so
    without this one corrupt sibling would make every merge verb in that
    department fatal.
    """
    for dept in sorted(depts):
        try:
            reconcile_order(dept, now, heir_hints=heir_hints, child_hints=child_hints)
        except (ValueError, OSError) as e:
            print(f"merge: warning: the merge is applied but {dept}'s order.json "
                  f"could not be synced: {e}\n"
                  f"merge: run `order sync {dept}` to rebuild it; order.json is "
                  f"derived state, so deleting an unreadable one first is safe",
                  file=sys.stderr)


def _require(cond, msg):
    if not cond:
        print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)


def _facts_referencing(root, pid):
    """QF-8 "At the tombstone": index rows in facts/.index.json whose
    `processes` names `pid` — read-only (never written here; the merge-only
    rule binds the five facts store files, not this lookup) and empty when
    the index file is absent, so a fresh/facts-less data root stays silent.

    A present-but-corrupt index must not make the tombstone fatal — same
    contract as `_sync_order`'s derived-state warning: catch and warn on
    stderr, treat it as no referencing facts.
    """
    idx_path = facts_dir(root) / ".index.json"
    if not idx_path.is_file():
        return []
    try:
        entries = read_json(idx_path).get("entries", [])
        return [row for row in entries if pid in (row.get("processes") or [])]
    except (ValueError, OSError, KeyError) as e:
        print(f"merge: warning: facts index unreadable — tombstone warnings "
              f"skipped: {e}", file=sys.stderr)
        return []


def _print_facts_warnings(pid, superseded_by):
    heir = f" (heir {', '.join(superseded_by)})" if superseded_by else ""
    for row in _facts_referencing(data_root(), pid):
        print(f"facts: {row.get('id')} «{row.get('title')}» → {pid}{heir}")


def _facts(args):
    """`merge facts …` — the facts store's verbs (spec §12).

    The writing verbs share the process verbs' contract: exit 2 on a failed
    precondition with nothing written. The reporting verbs (`audit`, `check`,
    `export`) take no `--run` and write nothing under `DATA_ROOT`; `audit` and
    `check` print one line per finding and exit 0 whatever they found — a
    finding is a line for a human to approve at stage C, not a failure.
    """
    try:
        if args.facts_cmd == "apply":
            report = apply_facts(data_root(), args.delta, args.run)
            for fid in report["created"]:
                print(f"created {fid}")
            for fid in report["updated"]:
                print(f"updated {fid}")
        elif args.facts_cmd == "resolve":
            resolve_facts(data_root(), args.id, args.field, args.account, args.run)
            print(f"resolved {args.id} {args.field}")
        elif args.facts_cmd == "retire":
            retire_facts(data_root(), args.id, args.heir, args.run, date=args.date)
            print(f"retired {args.id}")
        elif args.facts_cmd == "promote":
            promote_facts(data_root(), args.id, args.kind, args.key, args.run)
            print(f"promoted {args.id} to {args.kind}")
        elif args.facts_cmd == "repair-foreign-keys":
            repaired = repair_facts_foreign_keys(data_root(), args.run)
            for fid, dropped in repaired:
                print(f"repaired {fid} — dropped {dropped}")
            print(f"repaired {len(repaired)} entries")
        elif args.facts_cmd == "repair-source-refs":
            repaired, stuck = repair_facts_source_refs(data_root(), args.run)
            for fid, n in repaired:
                print(f"repaired {fid} — rewrote {n}")
            for fid, ref in stuck:
                print(f"left alone {fid} — {ref} names no file and the manifest "
                      f"maps it nowhere", file=sys.stderr)
            print(f"repaired {len(repaired)} entries")
        elif args.facts_cmd == "export":
            out = args.out or str(data_root() / f"{args.record}.csv")
            path = export_facts(data_root(), args.record, out, include_retired=args.all)
            print(str(path))
        elif args.facts_cmd == "revert":
            report = revert_facts(data_root(), args.run)
            for fid in report["removed"]:
                print(f"removed {fid}")
            for fid in report["restored"]:
                print(f"restored {fid}")
        elif args.facts_cmd in ("audit", "check"):
            root = data_root()
            findings = (audit_facts(root) if args.facts_cmd == "audit"
                        else check_facts(root))
            for item in findings:
                print(f"{item['code']} {item['id'] or ''} {item['message']}")
            if args.facts_cmd == "check":
                # last stdout line, verbatim — the ui-backend re-serves it in
                # Persian and QF-44 reads it as the readiness test
                counts = facts_coverage(root)
                print(f"coverage: {counts['read']} of {counts['total']} "
                      f"workbooks read")
        else:
            _require(False, "not implemented yet")
    except ValueError as e:
        print(f"merge: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="merge")
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new")
    n.add_argument("--candidate", required=True)
    n.add_argument("--department", required=True)
    n.add_argument("--run", required=True)
    n.add_argument("--now")
    u = sub.add_parser("update")
    u.add_argument("--process", required=True)
    u.add_argument("--delta", required=True)
    u.add_argument("--run", required=True)
    u.add_argument("--now")
    for name in ("accept", "reject"):
        r = sub.add_parser(name)
        r.add_argument("--process", required=True)
        r.add_argument("--index", type=int, required=True)
        r.add_argument("--now")
    rm = sub.add_parser("remove")
    rm.add_argument("--process", required=True)
    rm.add_argument("--run", required=True)
    rm.add_argument("--now")
    rs = sub.add_parser("restructure")
    rs.add_argument("--plan", required=True)
    rs.add_argument("--run", required=True)
    rs.add_argument("--now")
    at = sub.add_parser("attach-subprocess")
    at.add_argument("--parent-process", required=True)
    at.add_argument("--node", required=True)
    at.add_argument("--child", required=True)
    at.add_argument("--run", required=True)
    at.add_argument("--now")
    fa = sub.add_parser("facts")
    fsub = fa.add_subparsers(dest="facts_cmd", required=True)
    fap = fsub.add_parser("apply")
    fap.add_argument("--delta", required=True)
    fap.add_argument("--run", required=True)
    fre = fsub.add_parser("resolve")
    fre.add_argument("--id", required=True)
    fre.add_argument("--field", required=True)
    fre.add_argument("--account", required=True)
    fre.add_argument("--run", required=True)
    frt = fsub.add_parser("retire")
    frt.add_argument("--id", required=True)
    frt.add_argument("--heir")
    frt.add_argument("--run", required=True)
    frt.add_argument("--date")
    fpr = fsub.add_parser("promote")
    fpr.add_argument("--id", required=True)
    fpr.add_argument("--kind", required=True)
    fpr.add_argument("--key")
    fpr.add_argument("--run", required=True)
    frf = fsub.add_parser("repair-foreign-keys")
    frf.add_argument("--run", required=True)
    frs = fsub.add_parser("repair-source-refs")
    frs.add_argument("--run", required=True)
    fex = fsub.add_parser("export")
    fex.add_argument("--record", required=True)
    fex.add_argument("--out")
    fex.add_argument("--all", action="store_true")
    frv = fsub.add_parser("revert")
    frv.add_argument("--run", required=True)
    for verb in ("audit", "check"):
        fsub.add_parser(verb)          # reporting: no --run, nothing written
    args = ap.parse_args(argv)

    if args.cmd == "facts":            # its own clock — merge facts stamps UTC
        return _facts(args)

    # One clock for the whole invocation: the process files and order.json must
    # not land a second apart when --now is omitted.
    now = _now(args.now)

    try:
        if args.cmd == "new":
            _require(pathlib_exists(args.candidate), "candidate file must exist")
            parent, children = build_new(read_json(args.candidate), args.department,
                                         args.run, now)
            write_json_atomic(_proc_path(parent["id"]), parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            print(parent["id"])
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
            _sync_order({args.department}, now)
        elif args.cmd == "update":
            path = _proc_path(args.process)
            _require(path.is_file(), f"target process {args.process} must exist")
            _require(pathlib_exists(args.delta), "delta file must exist")
            parent, children = build_update(read_json(path), read_json(args.delta),
                                            args.run, now)
            write_json_atomic(path, parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
            depts = ({_dept_of(parent["id"])}
                     | {_dept_of(c["id"]) for c in children})
            _sync_order(depts, now,
                        child_hints={parent["id"]: [c["id"] for c in children]})
        elif args.cmd == "remove":
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = remove_process(read_json(path), now)
            write_json_atomic(path, proc)
            print(f"tombstoned {args.process}")
            _print_facts_warnings(args.process, proc.get("superseded_by"))
            _sync_order({_dept_of(args.process)}, now)
        elif args.cmd == "restructure":
            _require(pathlib_exists(args.plan), "plan file must exist")
            heirs, tombstoned = restructure(read_json(args.plan), args.run, now)
            for h in heirs:
                write_json_atomic(_proc_path(h["id"]), h)
                print(f"heir {h['id']}")
            for t in tombstoned:
                write_json_atomic(_proc_path(t["id"]), t)
                print(f"tombstoned {t['id']}")
                _print_facts_warnings(t["id"], t.get("superseded_by"))
            for h in heirs:
                for n in h["nodes"]:
                    if n.get("type") == "activity" and n.get("subprocess"):
                        print(f"subprocess {n['subprocess']} node {n['id']}")
            # a heir inherits the position of the earliest process it supersedes
            heir_hints = {}
            for t in tombstoned:
                for heir in t.get("superseded_by", []):
                    heir_hints.setdefault(heir, []).append(t["id"])
            depts = ({_dept_of(h["id"]) for h in heirs}
                     | {_dept_of(t["id"]) for t in tombstoned})
            _sync_order(depts, now, heir_hints=heir_hints)
        elif args.cmd == "attach-subprocess":
            pp = _proc_path(args.parent_process)
            cp = _proc_path(args.child)
            _require(pp.is_file(), f"parent process {args.parent_process} must exist")
            _require(cp.is_file(), f"child process {args.child} must exist")
            parent, child = attach_subprocess(read_json(pp), args.node, read_json(cp),
                                              args.run, now)
            write_json_atomic(pp, parent)
            write_json_atomic(cp, child)
            print(f"subprocess {child['id']} node {args.node}")
            _sync_order({_dept_of(args.parent_process), _dept_of(args.child)}, now)
        else:  # accept | reject
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = resolve_pending(read_json(path), args.index, args.cmd, now)
            write_json_atomic(path, proc)
            _sync_order({_dept_of(args.process)}, now)
    except ValueError as e:
        print(f"merge: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


def pathlib_exists(p):
    import pathlib
    return pathlib.Path(p).is_file()


if __name__ == "__main__":
    main()
