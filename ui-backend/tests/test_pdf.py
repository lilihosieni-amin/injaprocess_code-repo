"""The server-side PDF renderer.

What is testable here is everything except the browser: the print parameters, the
failure paths, the readiness wait and the serialisation. The one thing only a real
Chromium can prove — that the resulting PDF is right — is verified by hand in this
task's report and on the server in Task 5.
"""
import pathlib
import re
import threading
import time

import pytest
from inja_ui_backend import pdf

REPO = pathlib.Path(__file__).resolve().parents[2]
MM_PER_IN = 25.4

# The two files the printed geometry is actually decided by. Read, never restated:
# a paper box that drifts from these mis-slices every diagram without erroring (D23).
PRINT_CSS = (REPO / "ui" / "export" / "print" / "print.css")
BANDS_TS = (REPO / "ui" / "export" / "print" / "bands.ts")


def _strip_comments(css: str) -> str:
    return re.sub(r"/\*[\s\S]*?\*/", "", css)


def _page_margins_mm() -> dict[str, float]:
    """The `@page` margin the exported document declares, as top/right/bottom/left."""
    css = _strip_comments(PRINT_CSS.read_text(encoding="utf-8"))
    block = re.search(r"@page\s*\{([^}]*)\}", css)
    assert block, "print.css declares an @page box"
    decl = next(d for d in block.group(1).split(";") if d.strip().startswith("margin"))
    parts = [float(v.removesuffix("mm")) for v in decl.split(":", 1)[1].split()]
    assert all(v.endswith("mm") for v in decl.split(":", 1)[1].split()), "margins are in mm"
    a = parts[0]
    b = parts[1] if len(parts) > 1 else a
    c = parts[2] if len(parts) > 2 else a
    d = parts[3] if len(parts) > 3 else b
    return {"top": a, "right": b, "bottom": c, "left": d}


def _band_budget_px() -> dict[str, float]:
    """`PRINT.W` / `PRINT.H` from `bands.ts` — the box the page sliced itself into."""
    ts = _strip_comments(BANDS_TS.read_text(encoding="utf-8"))
    body = re.search(r"export const PRINT\s*=\s*\{([^}]*)\}", ts)
    assert body, "bands.ts exports a PRINT budget"
    got = dict(re.findall(r"(\w+)\s*:\s*([\d.]+)", body.group(1)))
    return {"W": float(got["W"]), "H": float(got["H"])}


class _FakeSession:
    """A CDP session that answers `Runtime.evaluate` from a script."""

    def __init__(self, ready_from_call: int | None = None):
        self.ready_from_call = ready_from_call
        self.calls: list[str] = []

    def call(self, method, params=None, *, deadline=None):
        self.calls.append((params or {}).get("expression", method))
        n = len(self.calls)
        ready = self.ready_from_call is not None and n >= self.ready_from_call
        return {"result": {"type": "boolean", "value": ready}}


# --------------------------------------------------------------------------- #
# the paper box (D23, D24)
# --------------------------------------------------------------------------- #

def test_print_params_carry_the_documents_own_page_margins():
    """The CDP margins are the stylesheet's `@page` margins, converted, not guessed.

    Read out of `print.css` rather than repeated here: if someone widens the box in
    the document, this fails instead of the diagrams quietly mis-slicing.
    """
    mm = _page_margins_mm()
    p = pdf.print_params()
    assert p["marginTop"] == pytest.approx(mm["top"] / MM_PER_IN)
    assert p["marginBottom"] == pytest.approx(mm["bottom"] / MM_PER_IN)
    assert p["marginLeft"] == pytest.approx(mm["left"] / MM_PER_IN)
    assert p["marginRight"] == pytest.approx(mm["right"] / MM_PER_IN)


def test_print_params_are_the_documented_millimetres():
    """And those margins are, explicitly, 8mm top/bottom and 13mm sides (D23)."""
    mm = _page_margins_mm()
    assert (mm["top"], mm["bottom"], mm["left"], mm["right"]) == (8.0, 8.0, 13.0, 13.0)


def test_paper_is_portrait():
    p = pdf.print_params()
    assert p["landscape"] is False
    assert p["paperHeight"] > p["paperWidth"]


def test_paper_box_is_big_enough_for_the_band_budget():
    """The sheet must fit what the page already sliced itself into.

    `bands.ts` planned the bands against `PRINT.W`/`PRINT.H` *before* the server
    prints. A smaller usable box does not error — it silently cuts every diagram.
    """
    p = pdf.print_params()
    budget = _band_budget_px()
    usable_w = (p["paperWidth"] - p["marginLeft"] - p["marginRight"]) * 96
    usable_h = (p["paperHeight"] - p["marginTop"] - p["marginBottom"]) * 96
    assert usable_w > budget["W"]
    assert usable_h > budget["H"]


def test_the_page_size_is_not_left_to_the_stylesheet():
    """`preferCSSPageSize` would hand the box back to `@page`, which names no size."""
    assert pdf.print_params()["preferCSSPageSize"] is False


def test_no_browser_chrome_and_colours_are_printed():
    """D24, both stated outright: without `printBackground` every colour vanishes."""
    p = pdf.print_params()
    assert p["displayHeaderFooter"] is False
    assert p["printBackground"] is True


# --------------------------------------------------------------------------- #
# failure paths
# --------------------------------------------------------------------------- #

def test_a_missing_browser_binary_raises_rather_than_traceback(tmp_path):
    html = tmp_path / "flowchart-abc.html"
    html.write_text("<!doctype html><title>x</title>", encoding="utf-8")
    with pytest.raises(pdf.PdfRenderError, match="nowhere/chromium"):
        pdf.render_pdf(tmp_path / "nowhere" / "chromium", html, tmp_path / "out.pdf")
    assert not (tmp_path / "out.pdf").exists()


def test_a_missing_export_html_raises_before_launching_anything(tmp_path):
    with pytest.raises(pdf.PdfRenderError, match="gone.html"):
        pdf.render_pdf(tmp_path / "chromium", tmp_path / "gone.html", tmp_path / "out.pdf")


# --------------------------------------------------------------------------- #
# the readiness wait
# --------------------------------------------------------------------------- #

def test_waiting_for_readiness_gives_up_rather_than_hanging():
    """A page whose diagrams never settle must cost a timeout, not the process.

    The realistic failure is silence, not a premature flag: a failed internal check
    restarts the page's whole per-process sweep, so on a large department the flag
    may never rise at all.
    """
    session = _FakeSession(ready_from_call=None)
    started = time.monotonic()
    with pytest.raises(pdf.PdfRenderError, match=r"__INJA_PRINT_READY__"):
        pdf._await_ready(session, "flowchart-abc.html", time.monotonic() + 0.3)
    assert time.monotonic() - started < 5, "it waited out its deadline and no longer"
    assert session.calls, "it did poll"


def test_waiting_stops_at_the_first_true_because_the_flag_is_monotone():
    session = _FakeSession(ready_from_call=2)
    pdf._await_ready(session, "flowchart-abc.html", time.monotonic() + 10)
    assert len(session.calls) == 2
    assert all(pdf.READY_FLAG in c for c in session.calls)


# --------------------------------------------------------------------------- #
# serialisation (D22)
# --------------------------------------------------------------------------- #

def test_two_renders_never_overlap(tmp_path, monkeypatch):
    """Peak is 300-400 MB against a 3.7 GB host shared with two bots."""
    spans: list[tuple[float, float]] = []
    guard = threading.Lock()

    def fake_render(chromium, html_path, timeout_s):
        t0 = time.monotonic()
        time.sleep(0.15)
        with guard:
            spans.append((t0, time.monotonic()))
        return b"%PDF-1.4\n"

    monkeypatch.setattr(pdf, "_render", fake_render)
    html = tmp_path / "flowchart-abc.html"
    html.write_text("<!doctype html><title>x</title>", encoding="utf-8")

    threads = [threading.Thread(target=pdf.render_pdf,
                                args=(tmp_path / "chromium", html, tmp_path / f"{i}.pdf"))
               for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert len(spans) == 2
    first, second = sorted(spans)
    assert first[1] <= second[0], "the second render began before the first ended"
    assert (tmp_path / "0.pdf").read_bytes() == b"%PDF-1.4\n"
    assert (tmp_path / "1.pdf").read_bytes() == b"%PDF-1.4\n"
