import re
from pathlib import Path


def sanitize_filename(name):
    name = Path(name).name  # strip any directory component
    name = re.sub(r"[^\w.\-]", "_", name, flags=re.UNICODE)
    return name or "file"


def attachment_dest(dept, original, data_root):
    safe = sanitize_filename(original)
    folder = Path(data_root) / "departments" / dept / "attachments"
    dest = folder / safe
    if not dest.exists():
        return dest
    stem, suffix = Path(safe).stem, Path(safe).suffix
    n = 2
    while (folder / f"{stem}-{n}{suffix}").exists():
        n += 1
    return folder / f"{stem}-{n}{suffix}"
