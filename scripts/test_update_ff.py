# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Tests for scripts/update_ff.py.

These verify the intended behaviour of ``update_l10n_last_commit_hash``: the
l10n repository is cloned via ``subprocess.run`` with an argv list and no shell,
so any shell metacharacters in the repository URL are passed through as a single,
inert argument rather than being interpreted by a shell.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import update_ff  # noqa: E402


def _fake_run_factory(calls):
  """Build a fake subprocess.run that records calls and fakes a clone."""

  def fake_run(cmd, *args, **kwargs):
    calls.append((cmd, kwargs))
    # Simulate the result of the clone so the function can read the ref.
    os.makedirs("l10n-temp/.git/refs/heads", exist_ok=True)
    with open("l10n-temp/.git/refs/heads/main", "w") as f:
      f.write("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n")
    return None

  return fake_run


def test_l10n_clone_uses_argv_not_shell(tmp_path, monkeypatch):
  monkeypatch.chdir(tmp_path)
  os.mkdir("build")  # the script expects the build dir to already exist
  calls = []
  monkeypatch.setattr(update_ff.subprocess, "run", _fake_run_factory(calls))

  update_ff.update_l10n_last_commit_hash()

  assert len(calls) == 1
  cmd, kwargs = calls[0]
  # argv list form => no shell interpretation of the URL.
  assert isinstance(cmd, list)
  assert cmd[:2] == ["git", "clone"]
  assert not kwargs.get("shell", False)

  # The hash is written without its trailing newline.
  with open("build/firefox-cache/l10n-last-commit-hash") as f:
    assert f.read() == "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"


@pytest.mark.parametrize("repo", [
    "a; rm -rf /",
    "$(touch pwned)",
    "|| cat /etc/passwd",
])
def test_repo_metacharacters_passed_as_single_argv_token(tmp_path, monkeypatch, repo):
  monkeypatch.chdir(tmp_path)
  os.mkdir("build")  # the script expects the build dir to already exist
  # L10N_REPO is a module-level constant, so this exercises the "URL becomes
  # configurable" case without ever invoking a shell.
  monkeypatch.setattr(update_ff, "L10N_REPO", repo)
  calls = []
  monkeypatch.setattr(update_ff.subprocess, "run", _fake_run_factory(calls))

  update_ff.update_l10n_last_commit_hash()

  cmd, kwargs = calls[0]
  assert not kwargs.get("shell", False)
  # The malicious string is one argv element, never split or interpreted.
  assert repo in cmd
  assert cmd.count(repo) == 1
