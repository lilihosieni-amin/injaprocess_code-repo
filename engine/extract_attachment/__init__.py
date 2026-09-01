import hashlib

from engine_common import data_root, under, write_text_atomic

from . import vision

# Read directly by whoever needs them — no conversion, nothing written to
# `.text/`, and no skip line (QF-30): these are already plain text.
PASSTHROUGH_EXTENSIONS = {".csv", ".md", ".txt", ".gs"}

# `.xlsx` is never converted here — dump-workbook owns the sheets estate.
WORKBOOK_MESSAGE = "workbooks are dumped by dump-workbook from attachments/sheets/"

# Dispatch table (QF-30): source extension -> `.text/{stem}{suffix}` output name.
# `.docx` goes through python-docx; every other row here goes through Vertex,
# with `kind` (the extension, without its dot) selecting the MIME type.
CONVERTERS = {
    ".docx": ".txt",
    ".pdf": ".pdf.md",
    ".jpg": ".image.md",
    ".jpeg": ".image.md",
    ".png": ".image.md",
    ".webp": ".image.md",
}


def attachments_dir(root, dept):
    return root / "departments" / dept / "attachments"


def text_dir(root, dept):
    return attachments_dir(root, dept) / ".text"


def find_docx(root, dept):
    adir = attachments_dir(root, dept)
    # glob on a missing directory yields nothing; .text/ is a subdir so *.docx
    # at this level never descends into it.
    return sorted(p for p in adir.glob("*.docx") if p.is_file())


def find_attachments(adir):
    """Every plain file directly under `adir` — never `.text/` or dotfiles."""
    if not adir.is_dir():
        return []
    return sorted(p for p in adir.iterdir() if p.is_file() and not p.name.startswith("."))


def docx_to_text(path):
    from docx import Document  # lazy — keeps import cost out of the fast paths
    doc = Document(str(path))
    lines = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                lines.append(cell.text)
    return "\n".join(lines).strip() + "\n"


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def _sidecar(dst):
    return dst.parent / (dst.name + ".sha256")


def needs_conversion(src, dst, digest=None):
    """Hash-gated (QF-30): a touched-but-unchanged source is not reconverted.

    Replaces the old mtime gate — `.docx` moves onto the same gate as the new
    Vertex rows, so a `touch`ed file never burns a Vertex call. `digest`, when
    given, skips recomputing the source hash (the caller already has it).
    """
    sidecar = _sidecar(dst)
    if not dst.exists() or not sidecar.exists():
        return True
    digest = digest if digest is not None else _sha256(src)
    return sidecar.read_text(encoding="utf-8").strip() != digest


def _convert(src, ext, convert, describe):
    """Return the converted text for one file, or raise (caught by the caller)."""
    if ext == ".docx":
        return convert(src)
    kind = ext[1:]                       # "pdf", "jpg", "jpeg", "png", "webp"
    if describe is not None:
        return describe(src, kind)
    if not vision.AVAILABLE:
        raise RuntimeError("vertex extra not installed")
    return vision.describe(src, kind)


def run_extract_attachment(dept, root=None, path=None, convert=None, describe=None):
    """Convert every attachment under a department (or `--path` root) to cached text.

    `path`, when given, is a DATA_ROOT-relative root used instead of a
    department's `attachments/` dir (QF-30's `--path`). `convert` overrides the
    default `.docx` converter; `describe` overrides the default Vertex describer
    (`vision.describe`) for every `.pdf`/image row — both are injection points
    for tests, mirroring `transcribe`'s injectable client.

    Returns `(ok, errors)`: `ok` is cached-output paths relative to `root`;
    `errors` is `(name, reason)` pairs — both genuine conversion failures and
    advisory skips (unsupported extension, `.xlsx`, missing `vertex` extra)
    land here, since the CLI reports every one of them the same way.

    Raises `ValueError` for a `--path` that leaves DATA_ROOT — a structural
    precondition failure, not a per-file skip, which the CLI turns into
    `error: …` and exit 2 rather than the 3 an unconvertible file gets.
    """
    root = root or data_root()
    adir = (root / path) if path is not None else attachments_dir(root, dept)
    # `--path` is a caller-supplied string joined onto DATA_ROOT, so it gets
    # the same containment test `merge facts export`'s `--out` gets — and
    # BEFORE any work: without it an escaping `--path` wrote a whole `.text/`
    # tree outside the store and only then failed, one file at a time, on the
    # `dst.relative_to(root)` below.
    if not under(adir, root):
        raise ValueError(f"--path {path} must stay under DATA_ROOT")
    tdir = adir / ".text"
    docx_convert = convert or docx_to_text
    ok, errors = [], []
    for src in find_attachments(adir):
        ext = src.suffix.lower()
        if ext in PASSTHROUGH_EXTENSIONS:
            continue
        if ext == ".xlsx":
            errors.append((src.name, WORKBOOK_MESSAGE))
            continue
        suffix = CONVERTERS.get(ext)
        if suffix is None:
            errors.append((src.name, f"no converter for {src.suffix or '(no extension)'} files"))
            continue
        dst = tdir / (src.stem + suffix)
        try:
            digest = _sha256(src)          # one read of src, reused for the gate and the sidecar
            if needs_conversion(src, dst, digest=digest):
                text = _convert(src, ext, docx_convert, describe)
                tdir.mkdir(parents=True, exist_ok=True)
                write_text_atomic(dst, text)
                write_text_atomic(_sidecar(dst), digest + "\n")
            ok.append(dst.relative_to(root).as_posix())
        except Exception as e:  # one bad file must not sink the rest (supplement)
            errors.append((src.name, str(e)))
    return ok, errors
