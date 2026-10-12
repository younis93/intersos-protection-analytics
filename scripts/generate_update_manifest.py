from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

version, repository, installer_name, output_name = sys.argv[1:5]
installer = Path(installer_name)
notes_path = Path(__file__).resolve().parents[1] / "RELEASE_NOTES.md"
notes = "\n".join(line.replace("**", "") for line in notes_path.read_text(encoding="utf-8").splitlines()
                  if not line.startswith("#")).strip()
if not notes:
    raise ValueError("Release notes must not be empty.")
manifest = {
    "version": version,
    "installerUrl": f"https://github.com/{repository}/releases/download/v{version}/{installer.name}",
    "sizeBytes": installer.stat().st_size,
    "sha256": hashlib.sha256(installer.read_bytes()).hexdigest(),
    "notes": notes,
    "publishedAt": datetime.now(timezone.utc).isoformat(),
}
Path(output_name).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
