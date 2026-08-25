import argparse
import os
import sys
from pathlib import Path

from engine_common import write_text_atomic
from transcribe import VertexTranscriber, run_transcribe


def main(argv=None):
    ap = argparse.ArgumentParser(prog="transcribe")
    ap.add_argument("basename")
    ap.add_argument("--out", help="also write the transcript here, atomically; "
                                  "an existing file is left alone and no call is made")
    args = ap.parse_args(argv)

    out = Path(args.out) if args.out else None
    if out and out.exists():          # FR-P2 idempotency, mirrored for --out
        print(out.read_text(encoding="utf-8"), end="")
        return 0

    tr = VertexTranscriber(os.environ.get("VERTEX_PROJECT"),
                           os.environ.get("VERTEX_LOCATION"),
                           os.environ.get("GEMINI_MODEL"),
                           bucket=os.environ.get("GCS_BUCKET"))
    try:
        text, _called = run_transcribe(args.basename, tr)
    except Exception as e:            # noqa: BLE001 - the message is the product here
        # Bot 1 shows this line to the user and the pipeline reads it from the
        # Bash output, so a clean sentence beats a traceback.
        print(f"error: {e}", file=sys.stderr)
        return 1
    if out:
        write_text_atomic(out, text)
    print(text, end="")               # raw transcript to stdout; the pipeline cleans + stores
    return 0
