import argparse
import os

from transcribe import VertexTranscriber, run_transcribe


def main(argv=None):
    ap = argparse.ArgumentParser(prog="transcribe")
    ap.add_argument("basename")
    args = ap.parse_args(argv)
    tr = VertexTranscriber(os.environ.get("VERTEX_PROJECT"),
                           os.environ.get("VERTEX_LOCATION"),
                           os.environ.get("GEMINI_MODEL"))
    text, _called = run_transcribe(args.basename, tr)
    print(text, end="")   # raw transcript to stdout; the pipeline (Phase 3) cleans + stores
    return 0
