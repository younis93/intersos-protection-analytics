from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response
from fastapi.testclient import TestClient

from backend.main import prevent_stale_api_state


def test_entry_html_cannot_reuse_asset_paths_from_an_old_build():
    app = FastAPI()
    app.middleware("http")(prevent_stale_api_state)

    @app.get("/")
    def entry():
        return HTMLResponse('<script type="module" src="/assets/current.js"></script>')

    @app.get("/assets/current.js")
    def asset():
        return Response("export const current = true;", media_type="text/javascript")

    api = TestClient(app)
    assert api.get("/").headers["cache-control"] == "no-store, no-cache, must-revalidate"
    assert "no-store" not in api.get("/assets/current.js").headers.get("cache-control", "")
