import os
import tempfile
from pathlib import Path


def staging_dir(data_root):
    d = Path(data_root) / ".staging"
    d.mkdir(parents=True, exist_ok=True)
    return d


def stage(data_root, data, hint="upload"):
    d = staging_dir(data_root)
    fd, tmp = tempfile.mkstemp(dir=str(d), prefix=f"{hint}-")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return Path(tmp)


def finalize(staged_path, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staged_path, dest)
    return dest


def discard(paths):
    for p in paths:
        try:
            Path(p).unlink()
        except FileNotFoundError:
            pass
