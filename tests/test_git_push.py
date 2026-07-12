import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "deploy" / "git-push" / "git-push-if-needed.sh"


def _run(repo):
    return subprocess.run(
        ["sh", str(SCRIPT)],
        env={"DATA_REPO": str(repo), "GIT_BRANCH": "main", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True,
    )


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   capture_output=True, text=True)


def _make_repo_with_remote(tmp_path):
    bare = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(bare)], check=True)
    work = tmp_path / "work"
    subprocess.run(["git", "clone", str(bare), str(work)], check=True,
                   capture_output=True, text=True)
    _git(work, "config", "user.email", "t@t")
    _git(work, "config", "user.name", "t")
    (work / "a.txt").write_text("1")
    _git(work, "add", "a.txt")
    _git(work, "commit", "-m", "init")
    _git(work, "push", "-u", "origin", "main")
    return work


def test_nothing_to_push_when_up_to_date(tmp_path):
    repo = _make_repo_with_remote(tmp_path)
    r = _run(repo)
    assert r.returncode == 0, r.stderr
    assert "nothing to push" in r.stdout


def test_pushes_when_ahead(tmp_path):
    repo = _make_repo_with_remote(tmp_path)
    (repo / "b.txt").write_text("2")
    _git(repo, "add", "b.txt")
    _git(repo, "commit", "-m", "second")
    r = _run(repo)
    assert r.returncode == 0, r.stderr
    assert "pushing 1 commit" in r.stdout
    # and the remote now has it
    r2 = _run(repo)
    assert "nothing to push" in r2.stdout


def test_unreachable_remote_is_safe(tmp_path):
    work = tmp_path / "work"
    subprocess.run(["git", "init", "-b", "main", str(work)], check=True,
                   capture_output=True, text=True)
    _git(work, "config", "user.email", "t@t")
    _git(work, "config", "user.name", "t")
    (work / "a.txt").write_text("1")
    _git(work, "add", "a.txt")
    _git(work, "commit", "-m", "init")
    _git(work, "remote", "add", "origin", str(tmp_path / "does-not-exist.git"))
    r = _run(work)
    assert r.returncode == 0, r.stderr
    assert "nothing to push" in r.stdout


def test_failed_push_reports_and_exits_nonzero(tmp_path):
    repo = _make_repo_with_remote(tmp_path)
    (repo / "b.txt").write_text("2")
    _git(repo, "add", "b.txt")
    _git(repo, "commit", "-m", "second")
    bare = tmp_path / "origin.git"
    for p in [bare, *bare.rglob("*")]:
        p.chmod(0o500 if p.is_dir() else 0o400)
    try:
        r = _run(repo)
    finally:
        for p in [bare, *bare.rglob("*")]:
            p.chmod(0o700 if p.is_dir() else 0o600)
    assert r.returncode != 0
    assert "push failed" in r.stderr
