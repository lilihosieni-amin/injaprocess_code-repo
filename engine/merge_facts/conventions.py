"""The estate's own conventions (spec §3.1, invariant I6).

The branch spellings, the item-code namespaces and their key prefixes, the
placeholder header, the month names and the table prefix are facts about ONE
estate's spreadsheets, not about the engine. They live in
`attachments/sheets/manifest.json` under `conventions`, `dump-workbook
--init-manifest` writes today's values into a manifest that has none, and every
module that reads the estate takes them from `load(root)` — so an estate that
spells its own things differently is configured, never patched into the engine.

Everything derived (the regexes, the code→key map) is built once per `load`,
which is what the module-level constants these replaced were for.
"""
import pathlib
import re
from dataclasses import dataclass

from engine_common import read_json

#: The zero-width non-joiner: «چاله‌باغ» and «چاله باغ» are one word.
ZWNJ = "‌"
_WS = re.compile(r"\s+")

#: §3.1's object, verbatim — what `--init-manifest` writes into a manifest that
#: carries none, and the fallback for every member a manifest leaves out.
DEFAULTS = {
    "branch_tokens": ["چاله باغ", "ناهارخوران", "ناهار خوران", "chalebagh",
                      "chale bagh", "naharkhoran", "nahar khoran"],
    "code_namespaces": {"##": "ing", "#": "food"},
    "placeholder_header": "^Column [0-9]+$",
    "month_names": ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
                    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"],
    "table_prefix": "Table_",
}

#: `branch_codes` is no member of the object: it is `manifest.branches[].code`.
#: This is what a manifest that declares no branch falls back to.
DEFAULT_BRANCH_CODES = ("chalebagh", "naharkhoran")


def _fold(text):
    """`build.fold`, which cannot be imported here without a cycle."""
    return _WS.sub(" ", (text or "").replace("\n", " ")).strip()


def _alternation(tokens):
    """One regex over `tokens`, longest first so the longest spelling at a
    position wins. No token matches nothing rather than everything."""
    kept = sorted({t for t in tokens if t}, key=lambda t: (-len(t), t))
    return re.compile("|".join(re.escape(t) for t in kept) if kept else r"(?!)",
                      re.I)


def cell_pattern(namespace, namespaces):
    """`##1` for `##`, and for `#` a `#` that is not part of a `##` — the guard
    generalised: whatever would extend this namespace into a longer one is
    refused before and after it."""
    others = [n for n in namespaces if n != namespace]
    before = sorted({n[:-len(namespace)] for n in others
                     if len(n) > len(namespace) and n.endswith(namespace)})
    after = sorted({n[len(namespace)] for n in others
                    if len(n) > len(namespace) and n.startswith(namespace)})
    return re.compile("".join(f"(?<!{re.escape(b)})" for b in before)
                      + re.escape(namespace)
                      + "".join(f"(?!{re.escape(a)})" for a in after)
                      + "[0-9]+")


@dataclass(frozen=True)
class Conventions:
    """One estate's conventions, with everything derived already built."""

    branch_tokens: tuple
    branch_codes: tuple
    code_namespaces: dict
    placeholder: re.Pattern
    month_names: tuple
    table_prefix: str
    #: Every namespace's codes in a run of text — `(?:##|#)[0-9]+`.
    code_in_text: re.Pattern
    #: The same, as the DUMPER scans a tab's first rows: the tail is «anything
    #: up to a space or another namespace», not digits, because a tab may head
    #: itself «گزارش روزانه ##RPT-1». It answers *does this tab print codes*,
    #: never *which key a row gets* — that is `code_in_text`'s stricter job.
    code_in_head: re.Pattern
    #: `{namespace: pattern}`, each matching only its own namespace's codes.
    code_in_cell: dict
    #: A branch token wherever it sits in an identifier (`…__ChaleBagh__…`).
    branch_in_text: re.Pattern

    @property
    def item_namespace(self):
        """The namespace an item-list code carries — the longest one.

        ponytail: the estate's `##` list is its item list and `#` its food
        list, and the longest namespace is what says «an item» in both the
        card and a rule's `ingredientId` binding. Name it in the manifest if
        an estate ever wants the shorter one.
        """
        return max(self.code_namespaces, key=len) if self.code_namespaces else ""

    def split_code(self, code):
        """`##1` → `("##", "1")`; a text that is no code keeps itself."""
        for namespace in sorted(self.code_namespaces, key=len, reverse=True):
            if code.startswith(namespace):
                return namespace, code[len(namespace):]
        return "", code

    def code_key(self, code):
        """`##1` → `ing_1`, `#71` → `food_71`. A store key is ASCII and matches
        `SEGMENT_RE`; `#` does not (QF-32), so the code itself lives in
        `item.data.code` and this is what a row is keyed by."""
        namespace, digits = self.split_code(code)
        return f"{self.code_namespaces[namespace]}_{digits}" if namespace else digits

    def code_slug(self, code):
        """`##1` → `ing1` — a unit id becomes a directory name and a log line,
        and `#` belongs in neither."""
        namespace, digits = self.split_code(code)
        return (self.code_namespaces[namespace] if namespace else "") + digits

    def matches_code(self, namespace, value):
        """Does `value` carry a code of `namespace`? The namespace is the
        entry's own (`refItems.namespace`, the store's frozen `#`/`##`), so an
        estate whose manifest declares other namespaces answers for it rather
        than raising."""
        pattern = self.code_in_cell.get(namespace) or cell_pattern(
            namespace, set(self.code_in_cell) | {namespace})
        return bool(pattern.search(value))

    def strip_branch(self, name):
        """The tab name with a branch token removed — «کانتر ناهارخوران» in one
        book and «کانتر» in another are the same tab (QF-47). ZWNJ folds to a
        space so «چاله‌باغ» and «چاله باغ» are one token."""
        folded = _fold(name.replace(ZWNJ, " ")).lower()
        for token in self.branch_tokens:
            folded = folded.replace(token, " ")
        return _WS.sub(" ", folded).strip()


def branch_tokens_for(manifest):
    """The default token list: every branch code and name, ZWNJ folded to a
    space, with and without the space, lower-cased, then §3.1's own spellings —
    so an estate that declares its branches needs no token list of its own."""
    out = []
    for branch in manifest.get("branches") or []:
        for text in (branch.get("code"), branch.get("name")):
            spaced = _fold((text or "").replace(ZWNJ, " ")).lower()
            for token in (spaced, spaced.replace(" ", "")):
                if token and token not in out:
                    out.append(token)
    return tuple(out + [t for t in DEFAULTS["branch_tokens"] if t not in out])


def from_manifest(manifest):
    """The conventions a manifest declares, member by member over the defaults."""
    manifest = manifest or {}
    given = {k: v for k, v in (manifest.get("conventions") or {}).items()
             if v is not None}
    members = dict(DEFAULTS, **given)
    tokens = tuple(members["branch_tokens"]) if given.get("branch_tokens") \
        else branch_tokens_for(manifest)
    namespaces = dict(members["code_namespaces"])
    return Conventions(
        branch_tokens=tokens,
        branch_codes=tuple(b["code"] for b in manifest.get("branches") or []
                           if b.get("code")) or DEFAULT_BRANCH_CODES,
        code_namespaces=namespaces,
        placeholder=re.compile(members["placeholder_header"]),
        month_names=tuple(members["month_names"]),
        table_prefix=members["table_prefix"],
        code_in_text=re.compile(
            "(?:%s)[0-9]+" % "|".join(
                re.escape(n) for n in sorted(namespaces, key=len, reverse=True))
            if namespaces else r"(?!)"),
        code_in_head=re.compile(
            "(?:%s)[^\\s%s]+" % (
                "|".join(re.escape(n) for n in
                         sorted(namespaces, key=len, reverse=True)),
                "".join(re.escape(n[0]) for n in sorted({n[0] for n in namespaces})))
            if namespaces else r"(?!)"),
        code_in_cell={n: cell_pattern(n, namespaces) for n in namespaces},
        branch_in_text=_alternation(tokens))


def effective(manifest):
    """The five members as a manifest carries them — what `--init-manifest`
    writes into a manifest that has none."""
    conventions = from_manifest(manifest)
    return {"branch_tokens": list(conventions.branch_tokens),
            "code_namespaces": dict(conventions.code_namespaces),
            "placeholder_header": conventions.placeholder.pattern,
            "month_names": list(conventions.month_names),
            "table_prefix": conventions.table_prefix}


def load(root):
    """The estate's conventions off `attachments/sheets/manifest.json`, or the
    defaults where there is no manifest yet — a test estate, or an estate
    before `--init-manifest` has run."""
    path = pathlib.Path(root) / "attachments" / "sheets" / "manifest.json"
    try:
        manifest = read_json(path) if path.is_file() else {}
    except ValueError:
        manifest = {}
    return from_manifest(manifest)


#: Today's values, for the callers that hold no root — a card rendered from the
#: schema alone, `validate facts` run on a file outside any estate. Every caller
#: that HAS a root passes `load(root)` instead.
DEFAULT = from_manifest({})
