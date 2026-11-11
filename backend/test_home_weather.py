from io import BytesIO
from unittest.mock import patch
from urllib.error import URLError

import pytest

from .home_weather import CONFIG_URL, read_home_weather


@pytest.mark.parametrize("mode", ["off", "rain", "snow"])
def test_read_published_weather(mode):
    with patch("backend.home_weather.urlopen", return_value=BytesIO(f'{{"mode":"{mode}"}}'.encode())) as fetch:
        assert read_home_weather() == mode
        assert fetch.call_args.args[0].full_url == CONFIG_URL
        assert fetch.call_args.kwargs["timeout"] == 5


@pytest.mark.parametrize("payload", [b"invalid", b"[]", b'{"mode":"hail"}', b" " * 1025])
def test_reject_invalid_weather(payload):
    with patch("backend.home_weather.urlopen", return_value=BytesIO(payload)):
        with pytest.raises(RuntimeError, match="setting unavailable"):
            read_home_weather()


def test_connection_failure_is_not_treated_as_off():
    with patch("backend.home_weather.urlopen", side_effect=URLError("offline")):
        with pytest.raises(RuntimeError, match="setting unavailable"):
            read_home_weather()
