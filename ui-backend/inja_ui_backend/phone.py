"""Canonical Iranian mobile numbers (spec D57).

The twin of ui/src/lib/digits.ts. If the two ever disagree, the same person can
hold two account identities, which is precisely what the canonical form exists
to prevent — so changes here need the same change there, and vice versa.
"""
from __future__ import annotations

import re

USERNAME_RE = re.compile(r"^09\d{9}$")

_PERSIAN = "۰۱۲۳۴۵۶۷۸۹"
_ARABIC = "٠١٢٣٤٥٦٧٨٩"
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate(_PERSIAN)}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate(_ARABIC)})

_SEPARATORS = re.compile(r"[\s\-()]")
_COUNTRY_CODE = re.compile(r"^(?:\+98|0098|98)")


def to_latin_digits(s: str) -> str:
    """Fold Persian and Arabic-Indic digits to ASCII.

    Not optional in a Persian-language product: ordinary keyboards emit ۰۹…, and
    a username that reaches storage unfolded is a different string from the same
    number typed on a latin keyboard.
    """
    return s.translate(_DIGIT_MAP)


def normalise_phone(raw: str) -> str:
    digits = _SEPARATORS.sub("", to_latin_digits(raw))
    if not digits:
        return ""
    # Strip a country code however it was written, then any trunk zeros it was
    # prepended to, then restore exactly one.
    national = _COUNTRY_CODE.sub("", digits).lstrip("0")
    return f"0{national}" if national else ""
