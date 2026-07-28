"""Print an already-written export document to PDF with headless Chromium.

Why a browser at all (spec §11, D17): the printed flowchart's diagrams do not exist
until JavaScript has run — the bands are measured and sliced in the page, from real
Persian glyph metrics. A non-executing renderer emits blank diagram pages, and a
primitives library would mean a second implementation of the node renderer, which is
exactly what `ui/export/flowchart/parity.test.tsx` exists to prevent.

The browser is driven as a **subprocess over CDP** — no Playwright, no Puppeteer,
which would pull a Node runtime and its dependency tree into a Python image. This
keeps the shape `ui-backend` already has: it shells out to the engine CLIs, and now
to one more binary. The only library involved is `websockets`, which is already in
the image as `uvicorn[standard]`'s WebSocket implementation.

This module imports nothing from FastAPI: it is infrastructure, and the export
endpoint wires it in.
"""
from __future__ import annotations

import base64
import contextlib
import json
import logging
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlsplit

from websockets.exceptions import WebSocketException
from websockets.sync.client import connect as ws_connect

from . import storage

logger = logging.getLogger(__name__)

#: The flag the exported document raises once its diagrams are genuinely complete
#: (`ui/export/shared/ready.ts`). A cross-repo-half contract: rename it here and the
#: renderer waits out its whole timeout on every document.
READY_FLAG = "__INJA_PRINT_READY__"

MM_PER_IN = 25.4

#: A4 portrait. `bands.ts` budgets the smaller of A4 and Letter in each direction —
#: A4's width (the narrower sheet) and Letter's height (the shorter) — so a band fits
#: either sheet and the server may pick. A4 is the paper this is printed on.
PAPER_W_IN = 210 / MM_PER_IN
PAPER_H_IN = 297 / MM_PER_IN

#: The `@page` box of both exported documents, `margin: 8mm 13mm` (D23). These must
#: equal what `ui/export/print/print.css` declares: `bands.ts` derives its page
#: budget (`PRINT.W 675`, `PRINT.H 965`) from them and the diagram is sliced into
#: bands *in the page*, before this module prints. A different box does not error —
#: it silently mis-slices every flowchart. `tests/test_pdf.py` reads both files and
#: pins the two against each other.
MARGIN_VERTICAL_MM = 8.0
MARGIN_SIDE_MM = 13.0

#: How often the readiness flag is polled, and how long a phase of the CDP
#: conversation may take before the whole render is called lost.
_READY_POLL_S = 0.25

#: `Page.printToPDF` answers with the whole document base64-encoded in one CDP
#: message; `websockets` caps an incoming message at 1 MiB by default, which a real
#: department's flowchart passes comfortably. The cap stays, generously raised: the
#: peer is a subprocess we launched, but an unbounded message is still unbounded.
_MAX_CDP_MESSAGE = 256 * 1024 * 1024

_DEVTOOLS_RE = re.compile(r"DevTools listening on (ws://\S+)")

#: One render at a time, process-wide (D22). Peak is 300-400 MB per browser against
#: a 3.7 GB host shared with two bots and a Claude Code runtime; two concurrent
#: exports must not stack two Chromiums on it. The lock is `threading`, not
#: `asyncio`: the caller runs this in a worker thread precisely because it blocks.
_RENDER_LOCK = threading.Lock()


class PdfRenderError(Exception):
    """The PDF could not be produced. Never fatal to an export (D21)."""


def launch_flags(user_data_dir: Path) -> list[str]:
    """The command line, with the two container-specific flags explained.

    * `--no-sandbox` — the ui-backend container runs as root, and Chromium's setuid
      sandbox refuses to start under uid 0. This is **not** carelessness and must not
      be removed as such: the alternative is running the whole service as a non-root
      user, which is a deployment change, not a flag change. What the browser opens
      is a local file this service wrote itself.
    * `--disable-dev-shm-usage` — Docker gives `/dev/shm` 64 MB by default and
      Chromium crashes part-way through a large page without this, writing its
      shared memory to /tmp instead.

    `--remote-debugging-port=0` lets the OS pick a free port; the real one is read
    back from the browser's stderr rather than guessed, so two renders could never
    collide on a fixed port even if the lock above were lost.
    """
    return [
        "--headless=new",
        "--remote-debugging-port=0",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={user_data_dir}",
    ]


def print_params() -> dict[str, Any]:
    """The `Page.printToPDF` parameters, which are the document's own page box.

    `displayHeaderFooter: false` and `printBackground: true` are stated outright
    (D24): the in-page path suppresses Chrome's chrome with an 8mm margin heuristic
    and relies on `print-color-adjust`, and neither is something to depend on here.
    Without `printBackground` every colour in the document vanishes.

    `preferCSSPageSize` is explicitly false: the stylesheet's `@page` names an
    orientation but no size, so honouring it would hand the sheet back to whatever
    Chromium's default happens to be.
    """
    return {
        "landscape": False,
        "displayHeaderFooter": False,
        "printBackground": True,
        "preferCSSPageSize": False,
        "paperWidth": PAPER_W_IN,
        "paperHeight": PAPER_H_IN,
        "marginTop": MARGIN_VERTICAL_MM / MM_PER_IN,
        "marginBottom": MARGIN_VERTICAL_MM / MM_PER_IN,
        "marginLeft": MARGIN_SIDE_MM / MM_PER_IN,
        "marginRight": MARGIN_SIDE_MM / MM_PER_IN,
    }


def render_pdf(chromium: Path, html_path: Path, out_path: Path,
               *, timeout_s: float = 90) -> None:
    """Render `html_path` to `out_path`, or raise `PdfRenderError`.

    `timeout_s` bounds one render and starts once this call owns the browser slot:
    a render queued behind another must not fail for having queued. It is generous
    on purpose — the page rebuilds its bands on a retry tick and a failed internal
    check restarts the whole per-process sweep, so a large department is slow rather
    than broken.

    It is also **coupled to `WATCH_MS` in `ui/export/flowchart/Document.tsx`**, and
    must stay below it. That constant is how long the document keeps looking for its
    own completed bands, and the flag this waits on is only ever raised while that
    window is open — so if the document stops watching first, a document that
    settles in the gap can never say so and this call burns the remainder of its
    timeout for nothing. `tests/test_pdf.py` reads both and pins the ordering; raise
    this past `WATCH_MS` and that test fails rather than the exports quietly losing
    their PDFs.
    """
    html_path, out_path = Path(html_path), Path(out_path)
    if not html_path.is_file():
        raise PdfRenderError(f"there is no export document to print at {html_path}")
    with _RENDER_LOCK:
        data = _render(Path(chromium), html_path, timeout_s)
        # Atomic, and only after a complete render: the PDF sits in a publicly
        # served folder beside its HTML, so a reader must never catch a truncated
        # one — and a failure must leave no file at all rather than a
        # plausible-looking short one.
        #
        # Inside the lock, not after it. Nothing serialises exports per department,
        # so two exports of the same one can be in flight at once — and they aim at
        # the *same* `out_path`, because the token is derived. Writing outside the
        # lock leaves a gap in which the second render can fail fast, return to the
        # endpoint and unlink that path (D21) before the first render's bytes land;
        # the first would then write a PDF its own export has already given up on,
        # and it would sit there stale with nothing left to clear it. Holding the
        # slot across the write costs milliseconds — the render it queues behind
        # takes seconds.
        storage.write_bytes_atomic(out_path, data)


# --------------------------------------------------------------------------- #
# the browser
# --------------------------------------------------------------------------- #

class _Browser:
    """A launched Chromium and the tail of what it said on stderr.

    stderr is drained by a thread from the moment the process starts: the DevTools
    endpoint is announced there, and a pipe nobody reads fills its 64 KB buffer and
    blocks the browser mid-render. The drained lines are also the only diagnostic
    when a launch fails, so the last few are kept.
    """

    def __init__(self, proc: subprocess.Popen, user_data_dir: Path):
        self.proc = proc
        self.user_data_dir = user_data_dir
        self.lines: deque[str] = deque(maxlen=40)
        self._new: deque[str] = deque()
        self._got = threading.Condition()
        self._reader = threading.Thread(target=self._drain, daemon=True)
        self._reader.start()

    def _drain(self) -> None:
        assert self.proc.stderr is not None
        # `ValueError` is the pipe being closed under this thread. `close()` joins
        # first precisely so that cannot happen, but that join is bounded — a
        # renderer child that outlived its parent can hold the write end open past
        # it — and on that one path the thread must end quietly rather than print an
        # unhandled-thread traceback into the container log, where it would read
        # like a renderer bug to whoever is diagnosing a real one.
        with contextlib.suppress(ValueError):
            for raw in self.proc.stderr:
                line = raw.decode("utf-8", "replace").rstrip()
                with self._got:
                    self.lines.append(line)
                    self._new.append(line)
                    self._got.notify_all()
        with self._got:
            self._got.notify_all()

    def next_line(self, deadline: float) -> Optional[str]:
        """The next unread stderr line, or None once the deadline or the pipe is out.

        The deadline is checked *before* the queue, not only when the queue is
        empty. A browser crash-looping on startup is both the case this is waiting
        on and the case that spews stderr fastest, so the caller could be handed
        queued line after queued line long past the moment it should have given up
        — measured at 0.89 s against a 0.5 s deadline, and taken while holding the
        render lock. Answering from a backlog is not a reason to overrun.
        """
        with self._got:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                if self._new:
                    return self._new.popleft()
                if not self._reader.is_alive():
                    return None
                if not self._got.wait(timeout=remaining):
                    return None

    def tail(self) -> str:
        return " | ".join(list(self.lines)[-6:]) or "(it said nothing)"

    def close(self) -> None:
        """Kill the browser and take its profile with it.

        A leaked Chromium on a 3.7 GB host is a memory problem, not an annoyance, so
        this runs from a `finally` on every path and escalates to SIGKILL rather
        than trusting a browser that is already misbehaving to honour SIGTERM.
        """
        try:
            if self.proc.poll() is None:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    with contextlib.suppress(subprocess.TimeoutExpired):
                        self.proc.wait(timeout=5)
        finally:
            # Join before closing. The drain thread is blocked in `readline` on
            # this very pipe, and closing it under the thread races: when the close
            # wins, the thread dies with `ValueError: readline of closed file` and
            # prints an unhandled-thread traceback into the container log — noise
            # that reads like a renderer bug to whoever is diagnosing a real one.
            #
            # The wait is bounded by the process above being dead: its pipe is then
            # at EOF and the loop ends on its own. The timeout covers the one case
            # that is not — a renderer child that inherited stderr and outlived its
            # parent keeps the write end open — and `_drain` swallows the
            # `ValueError` on that path, so the close below is still safe.
            self._reader.join(timeout=5)
            if self.proc.stderr is not None:
                with contextlib.suppress(OSError):
                    self.proc.stderr.close()
            shutil.rmtree(self.user_data_dir, ignore_errors=True)


def _launch(chromium: Path) -> _Browser:
    user_data_dir = Path(tempfile.mkdtemp(prefix="inja-pdf-"))
    try:
        proc = subprocess.Popen(
            [str(chromium), *launch_flags(user_data_dir), "about:blank"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except OSError as e:
        shutil.rmtree(user_data_dir, ignore_errors=True)
        raise PdfRenderError(f"could not start the browser at {chromium}: {e}") from e
    try:
        return _Browser(proc, user_data_dir)
    except BaseException:
        # The browser is already running by now; anything that goes wrong while
        # wrapping it (starting the stderr reader, say) would otherwise leak it,
        # since only a returned `_Browser` reaches `_render`'s `finally`.
        proc.kill()
        with contextlib.suppress(subprocess.TimeoutExpired):
            proc.wait(timeout=5)
        shutil.rmtree(user_data_dir, ignore_errors=True)
        raise


def _devtools_port(browser: _Browser, deadline: float) -> int:
    """The port the OS handed the browser, read off its own announcement."""
    while True:
        line = browser.next_line(deadline)
        if line is None:
            raise PdfRenderError(
                "the browser never announced a DevTools endpoint "
                f"(exit code {browser.proc.poll()}): {browser.tail()}")
        m = _DEVTOOLS_RE.search(line)
        if m:
            port = urlsplit(m.group(1)).port
            if port:
                return port


def _page_target(port: int, deadline: float) -> str:
    """The WebSocket URL of the browser's one tab.

    Taken from the DevTools HTTP endpoint rather than by creating a target over the
    browser-level session: it is one request, and it needs no flattened-session
    handling to then talk to the page.
    """
    last = "no page target appeared"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(  # noqa: S310 - a localhost port we launched
                    f"http://127.0.0.1:{port}/json/list", timeout=2) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
            for t in targets:
                if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                    return t["webSocketDebuggerUrl"]
        except (urllib.error.URLError, OSError, ValueError) as e:
            last = str(e)
        time.sleep(0.05)
    raise PdfRenderError(f"could not reach the browser's tab on port {port}: {last}")


class _Session:
    """One CDP conversation: send a numbered command, read past events for its reply."""

    def __init__(self, ws):
        self._ws = ws
        self._next_id = 0

    def call(self, method: str, params: Optional[dict] = None, *,
             deadline: float) -> dict:
        self._next_id += 1
        msg_id = self._next_id
        try:
            self._ws.send(json.dumps({"id": msg_id, "method": method,
                                      "params": params or {}}))
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PdfRenderError(f"{method} did not answer before the deadline")
                msg = json.loads(self._ws.recv(timeout=remaining))
                # Everything without our id is a domain event or a stale reply.
                if msg.get("id") != msg_id:
                    continue
                if "error" in msg:
                    raise PdfRenderError(f"{method} failed: {msg['error']}")
                return msg.get("result", {})
        except TimeoutError as e:
            raise PdfRenderError(f"{method} timed out: {e}") from e
        # `WebSocketException` is not an `OSError` — a browser that dies mid-print
        # closes the connection, and that must arrive at the caller as a
        # `PdfRenderError` like every other render failure, not as a stray type the
        # export endpoint does not catch.
        except (OSError, ValueError, WebSocketException) as e:
            raise PdfRenderError(f"the CDP connection failed during {method}: {e}") from e


def _await_ready(session, what, deadline: float) -> None:
    """Block until the page raises its readiness flag, or give up.

    **Not the load event.** The flowchart builds its bands after `document.fonts.ready`
    and then verifies that every node of every process landed inside one; printing on
    load captures empty or half-built diagrams. The flag is monotone — it is never
    written false — so one true reading is enough.

    The realistic failure here is silence rather than a premature flag: a failed
    check restarts the page's whole per-process sweep, so on a large department the
    sweep can outrun the page's retry window and the flag may never rise at all.
    This timeout is what turns that into a clean failure instead of a hung request.
    """
    expression = f"window.{READY_FLAG} === true"
    while time.monotonic() < deadline:
        result = session.call("Runtime.evaluate",
                              {"expression": expression, "returnByValue": True},
                              deadline=deadline)
        if result.get("result", {}).get("value") is True:
            return
        time.sleep(min(_READY_POLL_S, max(0.0, deadline - time.monotonic())))
    raise PdfRenderError(
        f"{what}: the page never set window.{READY_FLAG} — its diagrams did not "
        "finish building inside the render timeout, so nothing was printed")


def _render(chromium: Path, html_path: Path, timeout_s: float) -> bytes:
    deadline = time.monotonic() + timeout_s
    url = html_path.resolve().as_uri()
    browser = _launch(chromium)
    try:
        port = _devtools_port(browser, deadline)
        target = _page_target(port, deadline)
        try:
            ws = ws_connect(target, max_size=_MAX_CDP_MESSAGE,
                            open_timeout=max(1.0, deadline - time.monotonic()))
        except (OSError, TimeoutError, ValueError, WebSocketException) as e:
            raise PdfRenderError(f"could not attach to the browser's tab: {e}") from e
        with ws:
            session = _Session(ws)
            session.call("Page.enable", deadline=deadline)
            nav = session.call("Page.navigate", {"url": url}, deadline=deadline)
            if nav.get("errorText"):
                raise PdfRenderError(f"the browser could not open {url}: "
                                     f"{nav['errorText']}")
            _await_ready(session, html_path.name, deadline)
            printed = session.call("Page.printToPDF", print_params(), deadline=deadline)
        data = printed.get("data")
        if not data:
            raise PdfRenderError(f"the browser printed nothing for {html_path.name}")
        try:
            return base64.b64decode(data, validate=True)
        except (ValueError, TypeError) as e:
            raise PdfRenderError(f"the browser's PDF did not decode: {e}") from e
    finally:
        browser.close()
