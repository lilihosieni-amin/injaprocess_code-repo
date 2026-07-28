"""The server-side PDF renderer.

What is testable here is everything except the browser: the print parameters, the
failure paths, the readiness wait and the serialisation. The one thing only a real
Chromium can prove — that the resulting PDF is right — is verified by hand in this
task's report and on the server in Task 5.
"""
import inspect
import io
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
#: The other half of the readiness handshake: the document decides how long it
#: keeps watching for its own bands, this module decides how long it waits to be
#: told. The two are coupled and live in different languages, so they are pinned
#: against each other here rather than trusted to stay in step.
DOCUMENT_TSX = (REPO / "ui" / "export" / "flowchart" / "Document.tsx")


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


def _watch_ms() -> float:
    """`WATCH_MS` from `Document.tsx` — how long the document keeps looking."""
    ts = _strip_comments(DOCUMENT_TSX.read_text(encoding="utf-8"))
    m = re.search(r"const WATCH_MS\s*=\s*([\d_]+)", ts)
    assert m, "Document.tsx declares a WATCH_MS watch window"
    return float(m.group(1).replace("_", ""))


def _render_timeout_s() -> float:
    """`render_pdf`'s default `timeout_s` — how long the renderer keeps waiting."""
    return inspect.signature(pdf.render_pdf).parameters["timeout_s"].default


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
# the readiness handshake's two clocks
# --------------------------------------------------------------------------- #

def test_the_document_watches_for_longer_than_the_renderer_waits():
    """The only ordering of these two constants that is not a waste of time.

    `_await_ready` blocks until the page sets `__INJA_PRINT_READY__`, and the page
    only sets it while its own watch window is open. If the document stops looking
    first, every document that settles in the gap is one the renderer can never be
    told about: it burns the rest of its timeout and publishes an HTML with no PDF,
    for a document that had actually finished. With the watch window the longer of
    the two, a settling document is always still able to say so, and the timeout
    means what it is meant to mean — the page never finished at all.

    Both directions are then covered: a document that genuinely cannot complete is
    still bounded, by the renderer's own deadline rather than by the page's.
    """
    watch_s = _watch_ms() / 1000
    timeout_s = _render_timeout_s()
    assert watch_s > timeout_s, (
        f"the document stops watching at {watch_s}s but the renderer waits "
        f"{timeout_s}s — a document settling in between is never heard")


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


def test_the_pdf_is_written_while_the_render_slot_is_still_held(tmp_path, monkeypatch):
    """The write belongs inside the lock, not after it.

    Nothing serialises exports per department, so two exports of the same one can
    be in flight at once — and they aim at the *same* output path, because the
    token is derived. With the write outside the lock, the second render can fail
    fast, hand back to the endpoint and unlink that path in the gap between the
    first render finishing and its bytes landing; the first then writes a PDF that
    the export it belongs to has already given up on, and it survives as a stale
    file nothing will clear.
    """
    held = {}

    def observe(path, data):
        held["locked"] = pdf._RENDER_LOCK.locked()
        pathlib.Path(path).write_bytes(data)

    monkeypatch.setattr(pdf, "_render", lambda *a, **kw: b"%PDF-1.4\n")
    monkeypatch.setattr(pdf.storage, "write_bytes_atomic", observe)
    html = tmp_path / "flowchart-abc.html"
    html.write_text("<!doctype html><title>x</title>", encoding="utf-8")

    pdf.render_pdf(tmp_path / "chromium", html, tmp_path / "out.pdf")

    assert held["locked"] is True
    # and it is genuinely released afterwards — a lock held past the call would
    # serialise every later export against a render that is long finished
    assert pdf._RENDER_LOCK.locked() is False


# --------------------------------------------------------------------------- #
# the browser's stderr
# --------------------------------------------------------------------------- #

class _FakeProc:
    """Just enough of a `Popen` for `_Browser`: a stderr to drain and an exit code."""

    def __init__(self, stderr, returncode=0):
        self.stderr = stderr
        self.returncode = returncode

    def poll(self):
        return self.returncode


class _Chatty:
    """A stderr that never stops talking and never announces DevTools.

    Exactly what a Chromium crash-looping on startup produces, which is the case
    `_devtools_port`'s deadline exists for.
    """

    def __init__(self, n: int):
        self.n = n
        self.closed = False
        self.stop = False
        self.read_after_close = False

    def __iter__(self):
        for i in range(self.n):
            time.sleep(0.005)
            if self.closed:
                # what the real pipe raises, and what used to reach the log as an
                # unhandled-thread traceback
                self.read_after_close = True
                raise ValueError("readline of closed file")
            if self.stop:
                return
            yield b"[0728/104500.1] some chromium noise %d\n" % i

    def close(self):
        self.closed = True


def _drained(browser, timeout=5):
    browser._reader.join(timeout=timeout)
    assert not browser._reader.is_alive(), "the stderr reader never finished"


def test_next_line_honours_the_deadline_even_with_lines_already_queued(tmp_path):
    """A queued line is not a reason to overrun.

    `next_line` used to answer from the queue without looking at the clock, so a
    caller looping over a chatty stderr kept being handed lines long past its
    deadline — measured at 0.89 s against a 0.5 s one, taken while holding the
    render lock.
    """
    browser = pdf._Browser(_FakeProc(io.BytesIO(b"one\ntwo\nthree\n")), tmp_path / "p1")
    _drained(browser)
    assert browser._new, "the fixture queued lines to be ignored"
    assert browser.next_line(time.monotonic() - 1) is None


def test_next_line_still_returns_a_queued_line_inside_the_deadline(tmp_path):
    """The deadline check must not cost the ordinary path its answer."""
    browser = pdf._Browser(_FakeProc(io.BytesIO(b"one\ntwo\n")), tmp_path / "p2")
    _drained(browser)
    assert browser.next_line(time.monotonic() + 10) == "one"
    assert browser.next_line(time.monotonic() + 10) == "two"


def test_devtools_port_gives_up_at_its_deadline_against_a_chatty_browser(tmp_path):
    """The realistic launch failure: it talks, it never announces, it holds the lock.

    Bounded by lines consumed rather than by seconds, so the assertion says what it
    means on a loaded machine: past the deadline the loop must stop reading, not
    grind through a backlog first. The backlog is what makes the overrun — with an
    empty queue even the old code returned promptly, which is why this plants one.
    """
    chatty = _Chatty(4000)
    browser = pdf._Browser(_FakeProc(chatty), tmp_path / "p3")
    try:
        time.sleep(0.1)   # let a backlog build up, as a crash-looping browser would
        with browser._got:
            assert browser._new, "the fixture built a backlog"
            queued = browser._new[0]

        with pytest.raises(pdf.PdfRenderError, match="never announced a DevTools endpoint"):
            pdf._devtools_port(browser, time.monotonic() - 1)

        with browser._got:
            assert browser._new[0] == queued, (
                "it worked through the backlog after its deadline had already passed")
    finally:
        chatty.stop = True
        browser._reader.join(timeout=5)


def test_closing_the_browser_joins_its_reader_before_closing_the_pipe(tmp_path):
    """Otherwise the drain thread dies in `readline` on a pipe just closed under it.

    It is a daemon thread, so the render still returns the right answer — but it
    prints an unhandled-thread traceback into the container log, which reads like a
    renderer bug to whoever is diagnosing a real one.
    """
    chatty = _Chatty(8)
    browser = pdf._Browser(_FakeProc(chatty), tmp_path / "p4")

    browser.close()

    assert not browser._reader.is_alive(), "close() returned with the reader still running"
    assert chatty.read_after_close is False, (
        "the stderr pipe was closed under the live reader thread")
