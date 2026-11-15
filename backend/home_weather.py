import json
from typing import Literal
from urllib.error import URLError
from urllib.request import Request, urlopen

from .version import DEFAULT_GITHUB_REPOSITORY

WeatherMode = Literal["off", "rain", "snow"]
CONFIG_URL = f"https://raw.githubusercontent.com/{DEFAULT_GITHUB_REPOSITORY}/home-weather/home-weather.json"


def read_home_weather() -> WeatherMode:
    request = Request(CONFIG_URL, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
    try:
        with urlopen(request, timeout=5) as response:
            data = response.read(1025)
        if len(data) > 1024:
            raise ValueError("Weather setting is too large")
        config = json.loads(data)
        mode = config.get("mode") if isinstance(config, dict) else None
        if mode not in ("off", "rain", "snow"):
            raise ValueError("Invalid weather mode")
        return mode
    except (URLError, OSError, ValueError) as exc:
        raise RuntimeError("Home weather setting unavailable") from exc
