from pathlib import Path

# Persian (and Arabic-Indic) digits -> Latin, so users may type either.
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_date(raw):
    """Validate a Shamsi (Jalali) date and return canonical Latin YYYY-MM-DD.

    Accepts Persian or Latin digits and '/' or '-' separators
    (e.g. '۱۴۰۵/۰۴/۱۹' or '1405-04-19').
    """
    import jdatetime  # lazy: keeps naming.py importable without the dependency

    token = raw.strip().translate(_DIGITS).replace("/", "-")
    parts = token.split("-")
    try:
        if len(parts) != 3:
            raise ValueError("expected three parts")
        y, m, d = (int(p) for p in parts)
        jdatetime.date(y, m, d)  # raises on an impossible Jalali date
    except ValueError as e:
        raise ValueError(
            f"date must be a Shamsi date YYYY-MM-DD (e.g. 1405-04-19); got {raw!r}"
        ) from e
    return f"{y:04d}-{m:02d}-{d:02d}"


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
