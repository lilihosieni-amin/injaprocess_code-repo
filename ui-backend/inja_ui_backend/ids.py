import re

_ACT = re.compile(r"^[a-z]+-[0-9]{3}-n[0-9]{3}$")
_JUNC = re.compile(r"^[a-z]+-[0-9]{3}-j[0-9]+$")


def is_real_activity_id(s: str) -> bool:
    return bool(_ACT.match(s))


def is_real_junction_id(s: str) -> bool:
    return bool(_JUNC.match(s))


def is_terminal_id(s: str) -> bool:
    return s in ("start", "end")
