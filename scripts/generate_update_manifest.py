from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

version, repository, installer_name, output_name = sys.argv[1:5]
installer = Path(installer_name)
manifest = {
    "version": version,
    "installerUrl": f"https://github.com/{repository}/releases/download/v{version}/{installer.name}",
    "sha256": hashlib.sha256(installer.read_bytes()).hexdigest(),
    "notes": f"INTERSOS Protection Analytics {version}",
    "publishedAt": datetime.now(timezone.utc).isoformat(),
}
Path(output_name).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
