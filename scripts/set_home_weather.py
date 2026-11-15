"""Publish the Home weather mode using the authenticated GitHub CLI."""

import argparse
import base64
import json
import subprocess

REPOSITORY = "younis93/intersos-protection-analytics"
BRANCH = "home-weather"
REF = f"repos/{REPOSITORY}/git/ref/heads/{BRANCH}"
FILE = f"repos/{REPOSITORY}/contents/home-weather.json"


def github(method, path, *, fields=(), body=None, missing_ok=False):
    command = ["gh", "api", "--method", method, path, *fields]
    if body is not None:
        command.extend(["--input", "-"])
    result = subprocess.run(
        command, input=json.dumps(body) if body is not None else None,
        capture_output=True, text=True, check=False, timeout=30,
    )
    if result.returncode:
        if missing_ok and "(HTTP 404)" in result.stderr:
            return None
        raise RuntimeError(result.stderr.strip() or f"GitHub request failed: {method} {path}")
    return json.loads(result.stdout)


def read_file(missing_ok=False):
    return github("GET", FILE, fields=("-f", f"ref={BRANCH}"), missing_ok=missing_ok)


def file_mode(record):
    return json.loads(base64.b64decode(record["content"]))["mode"]


def publish(mode, initialize=False):
    if initialize and github("GET", REF, missing_ok=True) is None:
        base = github("GET", f"repos/{REPOSITORY}/git/ref/heads/main")
        github("POST", f"repos/{REPOSITORY}/git/refs", body={
            "ref": f"refs/heads/{BRANCH}", "sha": base["object"]["sha"],
        })
    current = read_file(missing_ok=initialize)
    if current and file_mode(current) == mode:
        return mode
    content = (json.dumps({"mode": mode}, separators=(",", ":")) + "\n").encode()
    body = {
        "branch": BRANCH,
        "message": f"Set Home weather to {mode}",
        "content": base64.b64encode(content).decode("ascii"),
    }
    if current:
        body["sha"] = current["sha"]
    github("PUT", FILE, body=body)
    if file_mode(read_file()) != mode:
        raise RuntimeError("GitHub weather setting changed before it could be verified")
    return mode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("off", "rain", "snow"))
    parser.add_argument("--initialize", action="store_true", help="Seed the dedicated branch with weather off")
    args = parser.parse_args()
    if args.initialize and args.mode != "off":
        parser.error("--initialize requires off")
    try:
        print(f"Published Home weather: {publish(args.mode, args.initialize)}")
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
