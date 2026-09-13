"""The three tiers every gate rule belongs to (spec 2026-09-13-facts-gate-tiers §4).

A rule reports a `Finding`. A REPAIR changes the entry in place and reports
nothing, or a NOTE when it could only partly succeed. While the rules are
converted track by track, `coerce` turns a legacy "label: message" string into
a REFUSE finding, so every consumer written against findings accepts both.
"""
import re
from dataclasses import dataclass

REFUSE = "refuse"
NOTE = "note"

#: What a person reads in the panel's issues card when a note carries no
#: Persian wording of its own.
SHAPE_ISSUE_FA = ("این مورد به شکلی ثبت شد که سامانه انتظار نداشت؛ "
                  "پیش از تأیید، این بخش را بازبینی کنید.")

_ITEM = re.compile(r"\b(decisions|new)\[(\d+)\]")


@dataclass(frozen=True)
class Finding:
    tier: str
    label: str
    message: str
    path: str | None = None
    mark: str = "issue"         # NOTE only: "inferred" | "issue" | "none"
    fa: str | None = None

    def line(self):
        return f"{self.label}: {self.message}" if self.label else self.message


def refuse(label, message, path=None):
    return Finding(REFUSE, label, message, path)


def note(label, message, path=None, mark="issue", fa=None):
    return Finding(NOTE, label, message, path, mark, fa)


def coerce(items):
    out = []
    for item in items or []:
        if isinstance(item, Finding):
            out.append(item)
            continue
        text = str(item)
        label, sep, message = text.partition(": ")
        out.append(refuse(label, message) if sep else refuse("", text))
    return out


def refusals(findings):
    return [f for f in coerce(findings) if f.tier == REFUSE]


def notes(findings):
    return [f for f in coerce(findings) if f.tier == NOTE]


def lines(findings):
    return [f.line() for f in coerce(findings)]


def item_of(finding):
    m = _ITEM.search(finding.label or "")
    return (m.group(1), int(m.group(2))) if m else None


def apply_notes(entry, findings):
    for f in notes(findings):
        if f.mark == "none":
            continue                  # "store as written, no mark": reported, never recorded
        if f.mark == "inferred" and f.path:
            entry.setdefault("field_status", {})[f.path] = "inferred"
            continue
        issue = {"kind": "shape", "description": f.fa or SHAPE_ISSUE_FA, "affects": []}
        issues = entry.setdefault("issues", [])
        if issue not in issues:
            issues.append(issue)
