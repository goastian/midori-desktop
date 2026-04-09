# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import sys
from pathlib import Path

# Resolve all paths from the repository root so execution is independent of CWD.
REPO_ROOT = Path(__file__).resolve().parent.parent
BROWSER_LOCALES = REPO_ROOT / "engine" / "browser" / "locales"
LOCALES_DIR = REPO_ROOT / "locales"
CUSTOM_LOCALES_DIR = REPO_ROOT / "src" / "browser" / "locales"


def copy_browser_locales(lang_id: str):
  """
  Copies language pack files to the specified browser locale directory.

  :param lang_id: Language identifier (e.g., 'en-US', 'fr', etc.)
  """
  lang_path = BROWSER_LOCALES / lang_id

  # Create the directory for the language pack if it doesn't exist
  os.makedirs(lang_path, exist_ok=True)
  print(f"Creating directory: {lang_path}")

  # If the language is 'en-US', handle special processing
  if lang_id == "en-US":
    # Remove files starting with "src" in the 'en-US' directory
    for root, _, files in os.walk(lang_path):
      for file in files:
        if file.startswith("src"):
          os.remove(os.path.join(root, file))

    # Copy files from the source directory
    en_us_candidates = [
      LOCALES_DIR / "en-US" / "browser",
      CUSTOM_LOCALES_DIR / "en-US" / "browser",
    ]

    for source_path in en_us_candidates:
      if source_path.exists():
        print(f"Using en-US source: {source_path}")
        copy_files(source_path, lang_path)
        return

    checked_paths = "\n".join([f"  - {path}" for path in en_us_candidates])
    raise FileNotFoundError(
      "No valid en-US source directory was found. Checked:\n"
      f"{checked_paths}\n"
      "Expected at least one valid source to continue."
    )
    return

  # For other languages, delete the existing directory and copy files anew
  if os.path.exists(lang_path):
    shutil.rmtree(lang_path)  # Remove existing directory

  source_path = LOCALES_DIR / lang_id
  copy_files(source_path, lang_path)


def copy_files(source: Path | str, destination: Path | str):
  """
  Copies files and directories from the source to the destination.

  :param source: Source directory path
  :param destination: Destination directory path
  """
  source_path = Path(source)
  destination_path = Path(destination)

  if not source_path.exists():
    raise FileNotFoundError(
      f"Source path '{source_path}' does not exist. "
      f"Current working directory: '{Path.cwd()}'"
    )

  # Recursively copy all files and directories
  for root, dirs, files in os.walk(source_path):
    # Determine relative path to preserve directory structure
    relative_path = os.path.relpath(root, source_path)
    destination_root = os.path.join(destination_path, relative_path)
    os.makedirs(destination_root, exist_ok=True)

    # Copy files
    for file in files:
      src_file = os.path.join(root, file)
      dest_file = os.path.join(destination_root, file)
      print(f"\tCopying {src_file} to {dest_file}")
      shutil.copy2(src_file, dest_file)  # Copy file with metadata


if __name__ == "__main__":
  if len(sys.argv) != 2:
    print("Usage: python script.py <LANG>")
    sys.exit(1)

  lang = sys.argv[1]
  print(f"Copying language pack for {lang}")
  try:
    copy_browser_locales(lang)
  except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
