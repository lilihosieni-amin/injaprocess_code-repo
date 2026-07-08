from datetime import date
from pathlib import Path


def normalize_date(raw):
    raw = raw.strip()
    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError as e:
        raise ValueError(
            f"date must be ISO YYYY-MM-DD (Gregorian); got {raw!r}") from e


def voice_basename(dept_codes, date_iso, data_root):
    depts = "_".join(sorted(set(dept_codes)))
    base = f"{depts}-{date_iso}"
    audio = Path(data_root) / "meetings" / "audio"

    def taken(stem):
        return any(audio.glob(f"{stem}.*"))

    if not taken(base):
        return base
    n = 2
    while taken(f"{base}-{n:02d}"):
        n += 1
    return f"{base}-{n:02d}"
