"""Windows portable launcher for INTERSOS Protection Analytics."""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def resource_path(*parts: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return root.joinpath(*parts)


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def open_dashboard(url: str) -> None:
    time.sleep(1)
    webbrowser.open(url)


def main() -> None:
    os.environ["UNHCR_UPLOAD_ONLY"] = "1"
    os.environ["UNHCR_STATIC_DIR"] = str(resource_path("frontend", "dist"))
    from backend.main import app
    from backend.version import APP_VERSION
    port = available_port()
    url = f"http://127.0.0.1:{port}"
    threading.Thread(target=open_dashboard, args=(url,), daemon=True).start()
    print(f"INTERSOS Protection Analytics {APP_VERSION} is running locally.")
    print(f"Open {url} if your browser did not start automatically.")
    print("Close this window to end the session and clear uploaded workbook data.")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
