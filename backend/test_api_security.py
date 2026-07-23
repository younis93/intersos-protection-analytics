import asyncio
import unittest
from unittest.mock import patch

from starlette.requests import Request
from starlette.responses import Response

from backend import main


class LocalApiSecurityTests(unittest.TestCase):
    def test_local_session_cookie_is_required_when_desktop_token_is_set(self):
        async def next_response(_request):
            return Response(status_code=200)

        with patch.object(main, "LOCAL_SESSION_TOKEN", "test-session-token"):
            unauthenticated = Request({"type": "http", "method": "GET", "path": "/api/health", "headers": []})
            denied = asyncio.run(main.prevent_stale_api_state(unauthenticated, next_response))
            self.assertEqual(denied.status_code, 403)

            authenticated = Request({
                "type": "http",
                "method": "GET",
                "path": "/api/health",
                "headers": [(b"cookie", b"intersos_session=test-session-token")],
            })
            allowed = asyncio.run(main.prevent_stale_api_state(authenticated, next_response))
            self.assertEqual(allowed.status_code, 200)


if __name__ == "__main__":
    unittest.main()
