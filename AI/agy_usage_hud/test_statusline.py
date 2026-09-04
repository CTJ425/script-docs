#!/usr/bin/env python3
"""
Automated Boundary Test Suite for the AGY Pure-ASCII Statusline.

Tier 0 replays payloads captured verbatim from Antigravity CLI 1.1.8 (with the
email, session id and paths replaced by placeholders). Everything above it is
built on that same shape, so a case can only pass if the script handles the
payload agy actually sends -- the previous suite was written against an
invented schema and so went green while the statusline was broken in the TUI.
"""

import subprocess
import json
import re
import sys
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HUD_DIR = Path(__file__).parent.resolve()
SCRIPT_PATH = HUD_DIR / "statusline_hud.py"

# ANSI Escape code removal regex
ANSI_REGEX = re.compile(r'\x1b\[[0-9;]*m')

GREEN = "\033[1;32m"
YELLOW = "\033[1;33m"
RED = "\033[1;31m"
DIM = "\033[2m"
RESET = "\033[0m"
STALE = f"{DIM}~{RESET}"

# Must track CACHE_VERSION in statusline_hud.py: a fixture written at the wrong
# version is discarded on read, and the case then silently tests the empty-cache
# path instead of whatever it meant to.
CACHE_VERSION = 2

# Countdown assertions compare rendered minutes, so a fixture must sit far
# enough inside its minute band that the seconds spent running the suite cannot
# push it into the one below.
BAND_SLACK = 30


def mid_band(offset_seconds: int) -> int:
    """Same rendered countdown as offset_seconds, but centred in its minute.

    11515s is 3h11m55s -- five seconds from rendering as 3h12m. Anchored against
    a real clock that is a coin flip, so fixtures are moved to the middle of the
    band they are asserting.
    """
    return (offset_seconds // 60) * 60 + BAND_SLACK

# ---------------------------------------------------------------------------
# Captured payloads (Antigravity CLI 1.1.8), verbatim apart from redaction.
# ---------------------------------------------------------------------------

CAPTURED_AUTHENTICATING = {
    "cwd": "/home/user/demo",
    "session_id": "",
    "conversation_id": "",
    "transcript_path": "/home/user/.gemini/antigravity/brain/.system_generated/logs/transcript.jsonl",
    "model": None,
    "workspace": {"current_dir": "/home/user/demo", "project_dir": "/home/user/demo"},
    "version": "1.1.8",
    "context_window": {
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "context_window_size": 0,
        "used_percentage": 0,
        "remaining_percentage": 0,
        "current_usage": None,
    },
    "exceeds_200k_tokens": None,
    "product": "antigravity",
    "agent_state": "authenticating",
    "sandbox": {"enabled": False},
    "terminal_width": 80,
}

CAPTURED_INITIALIZING = {
    "cwd": "/home/user/demo",
    "session_id": "",
    "conversation_id": "",
    "transcript_path": "/home/user/.gemini/antigravity/brain/.system_generated/logs/transcript.jsonl",
    "model": {
        "id": "Gemini 3.6 Flash (High)",
        "display_name": "Gemini 3.6 Flash (High)",
        "effort": "high",
    },
    "workspace": {"current_dir": "/home/user/demo", "project_dir": "/home/user/demo"},
    "version": "1.1.8",
    "context_window": {
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "context_window_size": 1048576,
        "used_percentage": 0,
        "remaining_percentage": 100,
        "current_usage": None,
    },
    "exceeds_200k_tokens": None,
    "product": "antigravity",
    "agent_state": "initializing",
    "sandbox": {"enabled": False},
    "email": "user@example.com",
    "terminal_width": 170,
}

CAPTURED_IDLE = {
    "cwd": "/home/user/demo",
    "session_id": "00000000-0000-0000-0000-000000000000",
    "conversation_id": "00000000-0000-0000-0000-000000000000",
    "transcript_path": "/home/user/.gemini/antigravity/brain/00000000/.system_generated/logs/transcript.jsonl",
    "model": {
        "id": "Gemini 3.6 Flash (High)",
        "display_name": "Gemini 3.6 Flash (High)",
        "effort": "high",
    },
    "workspace": {"current_dir": "/home/user/demo", "project_dir": "/home/user/demo"},
    "version": "1.1.8",
    "context_window": {
        "total_input_tokens": 146,
        "total_output_tokens": 380,
        "context_window_size": 1048576,
        "used_percentage": 0.01392364501953125,
        "remaining_percentage": 99.98607635498047,
        "current_usage": {
            "input_tokens": 19477,
            "output_tokens": 380,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
        },
    },
    "exceeds_200k_tokens": False,
    "product": "antigravity",
    "quota": {
        "3p-5h": {
            "remaining_fraction": 1,
            "reset_time": "2026-07-31T06:35:28Z",
            "reset_in_seconds": 17996,
        },
        "3p-weekly": {
            "remaining_fraction": 1,
            "reset_time": "2026-08-07T01:35:28Z",
            "reset_in_seconds": 604796,
        },
        "gemini-5h": {
            "remaining_fraction": 0.9986155,
            "reset_time": "2026-07-31T04:47:27Z",
            "reset_in_seconds": 11515,
        },
        "gemini-weekly": {
            "remaining_fraction": 0.8492495,
            "reset_time": "2026-08-05T01:32:05Z",
            "reset_in_seconds": 431793,
        },
    },
    "agent_state": "idle",
    "sandbox": {"enabled": False},
    "plan_tier": "Google AI Pro",
    "email": "user@example.com",
    "terminal_width": 170,
}


def iso_from_now(offset_seconds: int) -> str:
    """An absolute reset_time offset_seconds away, in the API's own format."""
    moment = datetime.fromtimestamp(time.time() + offset_seconds, tz=timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def captured_idle_now() -> dict:
    """CAPTURED_IDLE with its reset_time fields re-anchored to the present.

    The verbatim capture is dated, and reset_time is an absolute instant, so
    replaying it unchanged now means replaying a window that has already reset.
    That is the right rendering -- it is just not what a countdown assertion is
    trying to test, so those cases use this copy while TC-05 keeps the capture
    exactly as recorded.
    """
    payload = json.loads(json.dumps(CAPTURED_IDLE))
    for bucket in payload["quota"].values():
        bucket["reset_time"] = iso_from_now(mid_band(bucket["reset_in_seconds"]))
    return payload


def gemini_model(display_name="Gemini 3.6 Flash (High)"):
    return {"id": display_name, "display_name": display_name, "effort": "high"}


def oauth_token(expires_in: int = 3600, access_token: str = "test-token") -> dict:
    """A token file shaped like agy's, expiring expires_in seconds from now."""
    expiry = datetime.fromtimestamp(time.time() + expires_in, tz=timezone.utc)
    return {
        "token": {
            "access_token": access_token,
            "token_type": "Bearer",
            "refresh_token": "test-refresh-token",
            "expiry": expiry.isoformat(),
        },
        "auth_method": "oauth",
    }


def run_statusline_test(payload_str: str, env: dict = None, argv: list = None) -> tuple[str, str, int]:
    """Runs statusline_hud.py passing payload_str via stdin."""
    run_env = dict(os.environ)
    if env is not None:
        run_env.update(env)
    p = subprocess.Popen(
        [sys.executable, str(SCRIPT_PATH)] + list(argv or []),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=run_env
    )
    out, err = p.communicate(input=payload_str)
    return out.strip(), err.strip(), p.returncode


def verify_ascii(text: str) -> tuple[bool, list]:
    """Strips ANSI escape codes and verifies that all remaining characters are ASCII (<128)."""
    clean_text = ANSI_REGEX.sub('', text)
    non_ascii_chars = [(c, ord(c)) for c in clean_text if ord(c) >= 128]
    if non_ascii_chars:
        return False, non_ascii_chars
    return True, []


def as_list(value):
    """Lets check_str_part / check_absent_str_part take a string or a list."""
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)


def build_test_cases() -> list:
    return [
        # --- TIER 0: Captured payloads, replayed verbatim -------------------
        {
            "id": "TC-01",
            "tier": "Tier 0: Captured",
            "name": "Captured 'idle' payload renders model, ctx and both windows",
            "payload": lambda: json.dumps(captured_idle_now()),
            # gemini-5h     1 - 0.9986155 -> 0.1%,  11515s -> 3h11m
            # gemini-weekly 1 - 0.8492495 -> 15.1%, 431793s -> 4d23h
            # context_window: 19477 + 380 = 19857, the session's first
            # observation, so the cumulative figure equals it.
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx 19.9k | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)",
            "check_absent_str_part": ["--%", "{", "'id'"],
        },
        {
            "id": "TC-01b",
            "tier": "Tier 0: Captured",
            "name": "Captured payload replayed after its reset_time has passed rolls over",
            # reset_time is absolute, so replaying the dated capture verbatim is
            # replaying a window that has already reset. The countdown must
            # bottom out rather than restart at the recorded 3h11m.
            "payload": json.dumps(CAPTURED_IDLE),
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx 19.9k | 5h 0.1% (0m)",
            "check_absent_str_part": ["(3h11m)"],
        },
        {
            "id": "TC-02",
            "tier": "Tier 0: Captured",
            "name": "Captured 'authenticating' payload (model null, no quota)",
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_starts_with": "Ctx -- | 5h --%",
            "check_absent_str_part": ["0.0%", "None"],
        },
        {
            "id": "TC-03",
            "tier": "Tier 0: Captured",
            "name": "Captured 'initializing' payload (model set, quota not yet sent)",
            "payload": json.dumps(CAPTURED_INITIALIZING),
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx 0 | 5h --% | Wk --%",
            "check_absent_str_part": ["0.0%", "{"],
        },
        {
            "id": "TC-04",
            "tier": "Tier 0: Captured",
            "name": "context_window.used_percentage is not mistaken for quota",
            # The payload carries a used_percentage for the *context window*.
            # Reading it as quota would print 0.0% for a window we know nothing
            # about; only the quota block may feed the 5h/Wk figures.
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {"used_percentage": 42.0, "remaining_percentage": 58.0, "context_window_size": 1000000},
            }),
            "check_str_part": [f"5h {DIM}--%{RESET}", f"Wk {DIM}--%{RESET}", f"Ctx {GREEN}420k{RESET}"],
            "check_absent_str_part": ["5h 42.0%", "Wk 58.0%"],
        },

        # --- TIER 1: Colour thresholds --------------------------------------
        {
            "id": "TC-05",
            "tier": "Tier 1: Colour",
            "name": "Green below 70% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.65, "reset_in_seconds": 5400},
                    "gemini-weekly": {"remaining_fraction": 0.50, "reset_in_seconds": 172800},
                },
            }),
            "check_str_part": f"5h {GREEN}35.0%{RESET}",
        },
        {
            "id": "TC-06",
            "tier": "Tier 1: Colour",
            "name": "Yellow between 70% and 90% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.245, "reset_in_seconds": 3600},
                    "gemini-weekly": {"remaining_fraction": 0.12, "reset_in_seconds": 86400},
                },
            }),
            "check_str_part": f"5h {YELLOW}75.5%{RESET}",
        },
        {
            "id": "TC-07",
            "tier": "Tier 1: Colour",
            "name": "Red at or above 90% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.048, "reset_in_seconds": 1200},
                    "gemini-weekly": {"remaining_fraction": 0.02, "reset_in_seconds": 43200},
                },
            }),
            "check_str_part": f"5h {RED}95.2%{RESET}",
        },
        {
            "id": "TC-08",
            "tier": "Tier 1: Colour",
            "name": "Exact 70.0% and 90.0% land on yellow and red",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.30, "reset_in_seconds": 3600},
                    "gemini-weekly": {"remaining_fraction": 0.10, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": [f"5h {YELLOW}70.0%{RESET}", f"Wk {RED}90.0%{RESET}"],
        },

        # --- TIER 2: Quota family selection ---------------------------------
        {
            "id": "TC-09",
            "tier": "Tier 2: Family",
            "name": "Gemini model reads the gemini-* pool, not 3p-*",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                    "gemini-weekly": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                    "3p-5h": {"remaining_fraction": 0.10, "reset_in_seconds": 3600},
                    "3p-weekly": {"remaining_fraction": 0.10, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "40.0%",
            "check_absent_str_part": "90.0%",
        },
        {
            "id": "TC-10",
            "tier": "Tier 2: Family",
            "name": "Non-Gemini model reads the 3p-* pool",
            "payload": json.dumps({
                "model": {"id": "claude-sonnet-4-5", "display_name": "Claude Sonnet 4.5"},
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                    "gemini-weekly": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                    "3p-5h": {"remaining_fraction": 0.10, "reset_in_seconds": 3600},
                    "3p-weekly": {"remaining_fraction": 0.10, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "90.0%",
            "check_absent_str_part": "40.0%",
        },
        {
            "id": "TC-11",
            "tier": "Tier 2: Family",
            "name": "Bucket key casing is ignored (GEMINI-5H)",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "GEMINI-5H": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                    "Gemini-Weekly": {"remaining_fraction": 0.60, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "40.0%",
            "check_absent_str_part": "--%",
        },
        {
            "id": "TC-12",
            "tier": "Tier 2: Family",
            "name": "Only the other family present: fall back rather than show --%",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "3p-5h": {"remaining_fraction": 0.25, "reset_in_seconds": 3600},
                    "3p-weekly": {"remaining_fraction": 0.25, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "75.0%",
            "check_absent_str_part": "--%",
        },
        {
            "id": "TC-13",
            "tier": "Tier 2: Family",
            "name": "Unprefixed buckets still resolve",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "5h": {"remaining_fraction": 0.80, "reset_in_seconds": 3600},
                    "weekly": {"remaining_fraction": 0.80, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "20.0%",
            "check_absent_str_part": "--%",
        },

        {
            "id": "TC-13b",
            "tier": "Tier 2: Family",
            "name": "Buckets at the top level with no 'quota' wrapper are read",
            # Either window's key alone is enough to treat the payload itself
            # as the bucket container -- a weekly-only payload is as valid as
            # a 5h-only one.
            "payload": json.dumps({
                "model": gemini_model(),
                "weekly": {"remaining_fraction": 0.50, "reset_in_seconds": 172800},
            }),
            "check_str_part": f"Wk {GREEN}50.0%{RESET}",
        },

        # --- TIER 3: Model extraction ---------------------------------------
        {
            "id": "TC-14",
            "tier": "Tier 3: Model",
            "name": "Model object never leaks a Python repr into the line",
            # Regression: sanitize_ascii() used to str() a non-string, which
            # rendered "{'id': 'Gemini 3.6 F" as the model name.
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.5, "reset_in_seconds": 3600}},
            }),
            "check_starts_with": "Gemini 3.6 Flash (High) |",
            "check_absent_str_part": ["{", "}", "'id'", "'display_name'", "effort"],
        },
        {
            "id": "TC-15",
            "tier": "Tier 3: Model",
            "name": "display_name wins over id",
            "payload": json.dumps({
                "model": {"id": "gemini-3.6-flash-internal", "display_name": "Gemini 3.6 Flash"},
            }),
            "check_starts_with": "Gemini 3.6 Flash |",
            "check_absent_str_part": "internal",
        },
        {
            "id": "TC-16",
            "tier": "Tier 3: Model",
            "name": "id is used when display_name is missing or blank",
            "payload": json.dumps({"model": {"id": "gemini-3.6-pro", "display_name": "   "}}),
            "check_starts_with": "gemini-3.6-pro |",
        },
        {
            "id": "TC-17",
            "tier": "Tier 3: Model",
            "name": "Model object with no usable name is omitted entirely",
            "payload": json.dumps({"model": {"effort": "high"}}),
            "check_starts_with": "Ctx -- | 5h --%",
            "check_absent_str_part": ["{", "high"],
        },
        {
            "id": "TC-18",
            "tier": "Tier 3: Model",
            "name": "Legacy plain-string model is still accepted",
            "payload": json.dumps({"active_model": "gemini-3.6-flash"}),
            "check_starts_with": "gemini-3.6-flash |",
        },
        {
            "id": "TC-19",
            "tier": "Tier 3: Model",
            "name": "Overlong model name truncated to 24 chars",
            "payload": json.dumps({
                "model": {"display_name": "Gemini 3.6 Ultra Turbo Max Preview (Highest)"},
            }),
            "check_model_max_len": 24,
            "check_str_part": "Gemini 3.6 Ultra Turbo M",
        },
        {
            "id": "TC-20",
            "tier": "Tier 3: Model",
            "name": "Non-ASCII model name is stripped, not escaped",
            "payload": json.dumps({"model": {"display_name": "Gemini 3.6 ⚡ pro 中文"}}),
            "enforce_ascii_only_input": True,
            "check_str_part": "Gemini 3.6",
        },
        {
            "id": "TC-21",
            "tier": "Tier 3: Model",
            "name": "Garbage model types render no model rather than a repr",
            "payload": json.dumps({"model": [1, 2, 3]}),
            "check_starts_with": "Ctx -- | 5h --%",
            "check_absent_str_part": ["[", "1, 2, 3"],
        },

        # --- TIER 4: Usage field variations ---------------------------------
        {
            "id": "TC-22",
            "tier": "Tier 4: Fields",
            "name": "used_percent is honoured when present",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"used_percent": 33.3, "reset_in_seconds": 3600},
                    "gemini-weekly": {"used_percent": 44.4, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": ["33.3%", "44.4%"],
        },
        {
            "id": "TC-23",
            "tier": "Tier 4: Fields",
            "name": "used_percentage is honoured when present",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"used_percentage": 61.0, "reset_in_seconds": 3600},
                    "gemini-weekly": {"used_percentage": 62.0, "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": ["61.0%", "62.0%"],
        },
        {
            "id": "TC-24",
            "tier": "Tier 4: Fields",
            "name": "used_percent takes precedence over remaining_fraction",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"used_percent": 10.0, "remaining_fraction": 0.5,
                                  "reset_in_seconds": 3600},
                },
            }),
            "check_str_part": "10.0%",
            "check_absent_str_part": "50.0%",
        },
        {
            "id": "TC-25",
            "tier": "Tier 4: Fields",
            "name": "reset_in is accepted as an alias for reset_in_seconds",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.5, "reset_in": 7200}},
            }),
            "check_str_part": "(2h00m)",
        },
        {
            "id": "TC-26",
            "tier": "Tier 4: Fields",
            "name": "reset_time alone (no seconds) still renders the percentage",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.5, "reset_time": "2026-07-31T06:35:28Z"},
                },
            }),
            "check_str_part": ["50.0%", "(0m)"],
        },

        # --- TIER 5: Boundary values ----------------------------------------
        {
            "id": "TC-27",
            "tier": "Tier 5: Boundary",
            "name": "Percentage clamped at the low end",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 1.5, "reset_in_seconds": 3600}},
            }),
            "check_str_part": "0.0%",
        },
        {
            "id": "TC-28",
            "tier": "Tier 5: Boundary",
            "name": "Percentage clamped at the high end",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 125.0, "reset_in_seconds": 3600}},
            }),
            "check_str_part": "100.0%",
        },
        {
            "id": "TC-29",
            "tier": "Tier 5: Boundary",
            "name": "Negative reset renders 0m",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 1, "reset_in_seconds": -500}},
            }),
            "check_str_part": "(0m)",
        },
        {
            "id": "TC-30",
            "tier": "Tier 5: Boundary",
            "name": "Numeric-string reset is parsed",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": "3600.5"}},
            }),
            "check_str_part": "(1h00m)",
        },
        {
            "id": "TC-31",
            "tier": "Tier 5: Boundary",
            "name": "inf / nan reset values degrade to 0m",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": "inf"},
                    "gemini-weekly": {"remaining_fraction": 0.9, "reset_in_seconds": "nan"},
                },
            }),
            "check_str_part": "(0m)",
        },
        {
            "id": "TC-32",
            "tier": "Tier 5: Boundary",
            "name": "Day-scale and hour-scale countdowns format correctly",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": 11515},
                    "gemini-weekly": {"remaining_fraction": 0.9, "reset_in_seconds": 431793},
                },
            }),
            "check_str_part": ["(3h11m)", "(4d23h)"],
        },

        # --- TIER 6: Malformed payload defence ------------------------------
        {
            "id": "TC-33",
            "tier": "Tier 6: Defence",
            "name": "Empty stdin",
            "payload": "",
            "check_str_part": [f"Ctx {DIM}--{RESET}", f"5h {DIM}--%{RESET}"],
        },
        {
            "id": "TC-34",
            "tier": "Tier 6: Defence",
            "name": "Invalid JSON syntax",
            "payload": "{invalid json syntax payload...",
            "check_str_part": [f"Ctx {DIM}--{RESET}", f"5h {DIM}--%{RESET}"],
        },
        {
            "id": "TC-35",
            "tier": "Tier 6: Defence",
            "name": "JSON array payload",
            "payload": json.dumps([1, 2, 3, "corrupted"]),
            "check_str_part": [f"Ctx {DIM}--{RESET}", f"5h {DIM}--%{RESET}"],
        },
        {
            "id": "TC-36",
            "tier": "Tier 6: Defence",
            "name": "JSON primitive payload",
            "payload": json.dumps("raw_string_payload"),
            "check_str_part": [f"Ctx {DIM}--{RESET}", f"5h {DIM}--%{RESET}"],
        },
        {
            "id": "TC-37",
            "tier": "Tier 6: Defence",
            "name": "Empty JSON object",
            "payload": json.dumps({}),
            "check_starts_with": "Ctx -- | 5h ",
            "check_absent_str_part": "0.0%",
        },
        {
            "id": "TC-38",
            "tier": "Tier 6: Defence",
            "name": "quota present but not an object",
            "payload": json.dumps({"model": gemini_model(), "quota": "unavailable"}),
            "check_str_part": f"5h {DIM}--%{RESET}",
            "check_absent_str_part": "unavailable",
        },
        {
            "id": "TC-39",
            "tier": "Tier 6: Defence",
            "name": "Bucket present but not an object",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": "n/a", "gemini-weekly": None},
            }),
            "check_str_part": [f"5h {DIM}--%{RESET}", f"Wk {DIM}--%{RESET}"],
            "check_absent_str_part": ["n/a", "None"],
        },

        # --- TIER 7: Unknown vs zero ----------------------------------------
        {
            "id": "TC-40",
            "tier": "Tier 7: Unknown",
            "name": "Missing weekly bucket renders --%, not 0.0%",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.65, "reset_in_seconds": 5400}},
            }),
            "check_str_part": f"Wk {DIM}--%{RESET}",
            "check_absent_str_part": "0.0%",
        },
        {
            "id": "TC-41",
            "tier": "Tier 7: Unknown",
            "name": "Bucket with no usage field renders --%",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"reset_in_seconds": 5400, "reset_time": "2026-07-31T06:35:28Z"},
                    "gemini-weekly": {"remaining_fraction": 0.575, "reset_in_seconds": 86400},
                },
            }),
            "check_str_part": f"5h {DIM}--%{RESET}",
            "check_absent_str_part": "0.0%",
        },
        {
            "id": "TC-42",
            "tier": "Tier 7: Unknown",
            "name": "Unparseable usage renders --%, not 0.0%",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": "not-a-number", "reset_in_seconds": 5400},
                    "gemini-weekly": {"remaining_fraction": 0.575, "reset_in_seconds": 86400},
                },
            }),
            "check_str_part": f"5h {DIM}--%{RESET}",
            "check_absent_str_part": "0.0%",
        },
        {
            "id": "TC-43",
            "tier": "Tier 7: Unknown",
            "name": "Genuine zero usage still renders 0.0%",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"remaining_fraction": 1, "reset_in_seconds": 5400},
                    "gemini-weekly": {"remaining_fraction": 1.0, "reset_in_seconds": 86400},
                },
            }),
            "check_str_part": "0.0%",
            "check_absent_str_part": "--%",
        },

        # --- TIER 8: Line layout --------------------------------------------
        {
            "id": "TC-44",
            "tier": "Tier 8: Layout",
            "name": "Model is the first field on the line",
            "payload": json.dumps(CAPTURED_IDLE),
            "check_starts_with": "Gemini 3.6 Flash (High) |",
        },
        {
            "id": "TC-45",
            "tier": "Tier 8: Layout",
            "name": "No progress-bar characters anywhere on the line",
            "payload": json.dumps(CAPTURED_IDLE),
            # Checked after ANSI stripping: '[' also opens every escape sequence.
            "check_no_bar": True,
        },
        {
            "id": "TC-46",
            "tier": "Tier 8: Layout",
            "name": "Model-less line starts directly with Ctx and the 5h window",
            "payload": json.dumps({
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.65, "reset_in_seconds": 5400},
                    "gemini-weekly": {"remaining_fraction": 0.50, "reset_in_seconds": 172800},
                },
            }),
            "check_starts_with": "Ctx -- | 5h 35.0%",
            "check_no_bar": True,
        },
        {
            "id": "TC-47",
            "tier": "Tier 8: Layout",
            "name": "Dynamic layout rendering with complete quota and model formatting",
            "payload": json.dumps({
                "model": gemini_model("Gemini 3.6 Pro"),
                "quota": {
                    "gemini-5h": {"used_percent": 15.0, "reset_in_seconds": 3600},
                    "gemini-weekly": {"used_percent": 25.0, "reset_in_seconds": 86400},
                },
            }),
            "check_starts_with": "Gemini 3.6 Pro | Ctx -- | 5h 15.0% (1h00m) | Wk 25.0% (1d00h)",
        },

        # --- TIER 9: Cold-start cache & dynamic time-rolling ---------------
        {
            "id": "TC-48",
            "tier": "Tier 9: Cache",
            "name": "Cold-start cache write on valid payload",
            "payload": lambda: json.dumps(captured_idle_now()),
            "check_cache_exists": True,
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx 19.9k | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)",
        },
        {
            "id": "TC-49",
            "tier": "Tier 9: Cache",
            "name": "Cold-start fallback reads cached model and quota when payload authenticating",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 12.3, "fetched_at": time.time(),
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                    "gemini-weekly": {"used_percent": 45.6, "fetched_at": time.time(),
                                      "resets_at": int(time.time()) + 86400 + BAND_SLACK},
                }
            },
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx -- | 5h 12.3% (1h00m) | Wk 45.6% (1d00h)",
        },
        {
            "id": "TC-50",
            "tier": "Tier 9: Cache",
            "name": "Dynamic time-rolling countdown recalculates against system clock",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 300,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 20.0, "fetched_at": time.time() - 300,
                                  "resets_at": int(time.time()) + 3300 + BAND_SLACK},
                    "gemini-weekly": {"used_percent": 30.0, "fetched_at": time.time() - 300,
                                      "resets_at": int(time.time()) + 86100 + BAND_SLACK},
                }
            },
            "payload": json.dumps({"agent_state": "idle"}),
            "check_str_part": ["(55m)", "(23h55m)"],
        },
        {
            "id": "TC-51",
            "tier": "Tier 9: Cache",
            "name": "Window rollover: past resets_at renders 0.0% with no countdown",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 1000,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 88.0, "fetched_at": time.time(),
                                  "resets_at": int(time.time()) - 100},
                    "gemini-weekly": {"used_percent": 50.0, "fetched_at": time.time(),
                                      "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps({"agent_state": "idle"}),
            "check_str_part": f"5h {GREEN}0.0%{RESET}",
            "check_absent_str_part": ["88.0%", "(0m)"],
        },
        {
            "id": "TC-52",
            "tier": "Tier 9: Cache",
            "name": "Expired cache (>7 days) is ignored and falls back to --%",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - (8 * 86400),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 25.0, "resets_at": int(time.time()) + 3600},
                }
            },
            "payload": json.dumps({"agent_state": "authenticating"}),
            "check_str_part": f"5h {DIM}--%{RESET}",
            "check_absent_str_part": "25.0%",
        },
        {
            "id": "TC-53",
            "tier": "Tier 9: Cache",
            "name": "Multi-family bucket merging: 3p-* in cache persists when gemini-* updated",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "3p-5h": {"used_percent": 99.0, "fetched_at": time.time(),
                              "resets_at": int(time.time()) + 3600},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {"used_percent": 10.0, "reset_in_seconds": 1800}
                }
            }),
            "check_cache_contains_keys": ["3p-5h", "gemini-5h"],
        },
        {
            "id": "TC-54",
            "tier": "Tier 9: Cache",
            "name": "Corrupted cache file degrades gracefully without error",
            "setup_raw_cache": "{corrupted json cache content...",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 15.0, "reset_in_seconds": 1800}}
            }),
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx -- | 5h 15.0% (30m) | Wk --%",
        },
        {
            "id": "TC-55",
            "tier": "Tier 9: Cache",
            "name": "Unwritable cache directory degrades gracefully without error",
            "env": {"USAGE_HUD_CACHE": "/proc/unwritable_dir/cache.json"},
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 20.0, "reset_in_seconds": 1800}}
            }),
            "check_starts_with": "Gemini 3.6 Flash (High) | Ctx -- | 5h 20.0% (30m) | Wk --%",
        },
        {
            "id": "TC-56",
            "tier": "Tier 10: Live API",
            "name": "Background fetch handles invalid token file gracefully",
            "env": {"USAGE_HUD_TOKEN_PATH": "/nonexistent/token.json",
                    "USAGE_HUD_DISABLE_BG_FETCH": "0"},
            "payload": json.dumps({"agent_state": "idle"}),
            "check_starts_with": "Ctx -- | 5h --%",
        },
        {
            "id": "TC-57",
            "tier": "Tier 10: Live API",
            "name": "A recent API bucket outranks the stdin payload",
            # The poller sees the server's own figure; agy only refreshes the
            # payload's quota when a response arrives. Rendering the payload
            # here is what made live refresh invisible.
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "last_api_fetch": time.time(),
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time(),
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 0.1, "reset_in_seconds": 1800}},
            }),
            "check_str_part": "73.1%",
            "check_absent_str_part": ["0.1%", STALE],
        },
        {
            "id": "TC-58",
            "tier": "Tier 10: Live API",
            "name": "A payload does not overwrite a recent API bucket in the cache",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "last_api_fetch": time.time(),
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time(),
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 0.1, "reset_in_seconds": 1800}},
            }),
            "check_cache_bucket": {"gemini-5h": {"used_percent": 73.1, "source": "api"}},
        },
        {
            "id": "TC-59",
            "tier": "Tier 10: Live API",
            "name": "An API bucket older than its precedence window yields to the payload",
            # The age here tracks API_RESULT_MAX_AGE_SECONDS and has to stay
            # clear of it. It was 120s while that window was 30s; the window is
            # now the staleness threshold, because a shorter one let a single
            # failed poll hand the display back to a frozen payload (TC-79).
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 900,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time() - 900,
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 0.1, "reset_in_seconds": 1800}},
            }),
            "check_str_part": "0.1%",
            "check_absent_str_part": "73.1%",
        },
        {
            "id": "TC-60",
            "tier": "Tier 10: Live API",
            "name": "Payload countdown reuses its stored anchor instead of re-pinning to now",
            # reset_in_seconds is relative to when agy built the payload. Anchor
            # it once: re-deriving now + 1800 every render froze the countdown at
            # 30m forever and stopped the window ever rolling over.
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 600,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 0.1, "source": "payload",
                                  "fetched_at": time.time() - 600,
                                  "anchor_reset_in": 1800,
                                  "resets_at": int(time.time()) + 1200 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 0.1, "reset_in_seconds": 1800}},
            }),
            "check_str_part": "(20m)",
            "check_absent_str_part": "(30m)",
        },
        {
            "id": "TC-61",
            "tier": "Tier 10: Live API",
            "name": "A changed reset_in_seconds re-anchors rather than reusing the old deadline",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 600,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 0.1, "source": "payload",
                                  "fetched_at": time.time() - 600,
                                  "anchor_reset_in": 1800,
                                  "resets_at": int(time.time()) + 1200 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"used_percent": 0.1, "reset_in_seconds": 3600 + BAND_SLACK}},
            }),
            "check_str_part": "(1h00m)",
        },
        {
            "id": "TC-62",
            "tier": "Tier 10: Live API",
            "name": "Cached figures nobody confirmed recently are marked stale",
            # The frozen-HUD case: token expired, payload carries no quota. The
            # number is still the best available, but it must not pass for live.
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 7200,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time() - 7200,
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_str_part": f"5h {STALE}{YELLOW}73.1%{RESET}",
        },
        {
            "id": "TC-63",
            "tier": "Tier 10: Live API",
            "name": "Recently confirmed cached figures are not marked stale",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "payload",
                                  "fetched_at": time.time() - 60,
                                  "resets_at": int(time.time()) + 3600 + BAND_SLACK},
                }
            },
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_str_part": f"5h {YELLOW}73.1%{RESET}",
            "check_absent_str_part": STALE,
        },
        {
            "id": "TC-64",
            "tier": "Tier 10: Live API",
            "name": "Failed background fetch writes a complete, re-readable cache",
            # A bare {"last_api_fetch": ...} has no version, so read_cache
            # rejects it -- losing the very bookkeeping the write was for and
            # respawning the fetch on every render.
            "argv": ["--bg-fetch"],
            "env": {"USAGE_HUD_TOKEN_PATH": "/nonexistent/token.json"},
            "payload": "",
            "check_cache_top_keys": ["version", "saved_at", "model", "quota",
                                     "last_api_fetch", "last_api_error"],
        },
        {
            "id": "TC-65",
            "tier": "Tier 10: Live API",
            "name": "Failed background fetch preserves existing cached buckets",
            "argv": ["--bg-fetch"],
            "env": {"USAGE_HUD_TOKEN_PATH": "/nonexistent/token.json"},
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time(),
                                  "resets_at": int(time.time()) + 3600},
                }
            },
            "payload": "",
            "check_cache_bucket": {"gemini-5h": {"used_percent": 73.1, "source": "api"}},
        },
        {
            "id": "TC-66",
            "tier": "Tier 10: Live API",
            "name": "An expired OAuth token renders without stderr and without hanging",
            "setup_token": lambda: oauth_token(expires_in=-3600),
            "env": {"USAGE_HUD_DISABLE_BG_FETCH": "0"},
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_starts_with": "Ctx -- | 5h --%",
        },

        # --- TIER 12: Context Window ----------------------------------------
        {
            "id": "TC-67",
            "tier": "Tier 12: Context Window",
            "name": "Context window with current_usage input+output formatted correctly",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1048576,
                    "current_usage": {"input_tokens": 19477, "output_tokens": 380},
                },
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": 3600},
                }
            }),
            "check_str_part": f"Ctx {GREEN}19.9k{RESET}",
        },
        {
            "id": "TC-68",
            "tier": "Tier 12: Context Window",
            "name": "Small context window usage under 1k renders integer tokens",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1048576,
                    "total_input_tokens": 146,
                    "total_output_tokens": 0,
                },
            }),
            "check_str_part": f"Ctx {GREEN}146{RESET}",
        },
        {
            "id": "TC-69",
            "tier": "Tier 12: Context Window",
            "name": "Large 2M context window size formats as 2M",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 2000000,
                    "current_usage": {"input_tokens": 250000},
                },
            }),
            "check_str_part": f"Ctx {GREEN}250k{RESET}",
        },
        {
            "id": "TC-70",
            "tier": "Tier 12: Context Window",
            "name": "Context window green color below 70% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1000000,
                    "current_usage": {"input_tokens": 500000},
                },
            }),
            "check_str_part": f"Ctx {GREEN}500k{RESET}",
        },
        {
            "id": "TC-71",
            "tier": "Tier 12: Context Window",
            "name": "Context window yellow color between 70% and 90% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1000000,
                    "current_usage": {"input_tokens": 750000},
                },
            }),
            "check_str_part": f"Ctx {YELLOW}750k{RESET}",
        },
        {
            "id": "TC-72",
            "tier": "Tier 12: Context Window",
            "name": "Context window red color at or above 90% used",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1000000,
                    "current_usage": {"input_tokens": 950000},
                },
            }),
            "check_str_part": f"Ctx {RED}950k{RESET}",
        },
        {
            "id": "TC-73",
            "tier": "Tier 12: Context Window",
            "name": "Missing context_window renders Ctx --",
            "payload": json.dumps({"model": gemini_model()}),
            "check_str_part": f"Ctx {DIM}--{RESET}",
            "check_absent_str_part": ["Ctx 0", "Ctx 0k"],
        },
        {
            "id": "TC-74",
            "tier": "Tier 12: Context Window",
            "name": "Zero context_window_size (authenticating) renders Ctx --",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {"context_window_size": 0, "total_input_tokens": 0},
            }),
            "check_str_part": f"Ctx {DIM}--{RESET}",
        },
        {
            "id": "TC-75",
            "tier": "Tier 12: Context Window",
            "name": "total_input_tokens fallback when current_usage is absent",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 200000,
                    "total_input_tokens": 15000,
                    "total_output_tokens": 500,
                },
            }),
            "check_str_part": f"Ctx {GREEN}15.5k{RESET}",
        },
        {
            "id": "TC-76",
            "tier": "Tier 12: Context Window",
            "name": "used_percentage fallback when token counts are absent",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1000000,
                    "used_percentage": 20.0,
                },
            }),
            "check_str_part": f"Ctx {GREEN}200k{RESET}",
        },
        {
            "id": "TC-77",
            "tier": "Tier 12: Context Window",
            "name": "Corrupted or non-numeric context_window values degrade gracefully",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": "not-a-size",
                    "current_usage": "garbage",
                },
            }),
            "check_str_part": f"Ctx {DIM}--{RESET}",
        },
        {
            "id": "TC-78",
            "tier": "Tier 12: Context Window",
            "name": "Pure ASCII compliance with Ctx segment",
            "payload": json.dumps({
                "model": gemini_model(),
                "context_window": {
                    "context_window_size": 1048576,
                    "current_usage": {"input_tokens": 12345, "output_tokens": 67},
                },
            }),
            "check_str_part": f"Ctx {GREEN}12.4k{RESET}",
        },

        # --- TIER 13: Live refresh ------------------------------------------
        {
            "id": "TC-79",
            "tier": "Tier 13: Live Refresh",
            "name": "A polled figure outranks a disagreeing payload for the whole staleness window",
            # The payload carries no timestamp of its own -- agy refreshes its
            # quota block only when a response arrives -- so a precedence window
            # shorter than the cooldown let one failed poll hand the display back
            # to a frozen figure, which write_cache then persisted.
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 300,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 73.1, "source": "api",
                                  "fetched_at": time.time() - 300,
                                  "resets_at": int(time.time()) + 3630},
                },
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.999, "reset_in_seconds": 3630}},
            }),
            "check_str_part": f"5h {YELLOW}73.1%{RESET}",
            "check_absent_str_part": ["0.1%", "~"],
            "check_cache_bucket": {"gemini-5h": {"used_percent": 73.1, "source": "api"}},
        },
        {
            "id": "TC-80",
            "tier": "Tier 13: Live Refresh",
            "name": "An API entry's absolute deadline anchors the payload's relative countdown",
            # The poller writes resets_at but no anchor_reset_in. With no way to
            # reuse that absolute deadline, the payload path re-pinned
            # now + reset_in_seconds on every render and the countdown froze --
            # the TC-60/TC-61 defect, re-entering through the API path.
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 700,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 10.0, "source": "api",
                                  "fetched_at": time.time() - 700,
                                  "resets_at": int(time.time()) + 9930},
                },
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": 10630}},
            }),
            "check_str_part": "(2h45m)",
            "check_absent_str_part": "(2h57m)",
        },
        {
            "id": "TC-81",
            "tier": "Tier 13: Live Refresh",
            "name": "A payload describing a different window re-anchors instead of reusing the cache",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()) - 700,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 10.0, "source": "api",
                                  "fetched_at": time.time() - 700,
                                  "resets_at": int(time.time()) + 200},
                },
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": 18030}},
            }),
            "check_str_part": "(5h00m)",
            "check_absent_str_part": "(3m)",
        },
        {
            "id": "TC-82",
            "tier": "Tier 13: Live Refresh",
            "name": "A window with no usage renders no countdown",
            # The quota API slides an unused window's resetTime to now + the
            # window length, so the figure never moves. A countdown that cannot
            # count down is worse than no countdown at all.
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 1, "reset_in_seconds": 18030}},
            }),
            "check_str_part": f"5h {GREEN}0.0%{RESET}",
            "check_absent_str_part": "(5h00m)",
        },
        {
            "id": "TC-83",
            "tier": "Tier 13: Live Refresh",
            "name": "A window with usage still renders its countdown",
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 0.9, "reset_in_seconds": 18030}},
            }),
            "check_str_part": [f"5h {GREEN}10.0%{RESET}", "(5h00m)"],
        },
        {
            "id": "TC-84",
            "tier": "Tier 13: Live Refresh",
            "name": "A zero-usage window whose deadline has passed still renders 0m",
            # Suppression applies to the sliding deadline of an unused window,
            # not to one that has genuinely run out: TC-29's terminal 0m stands.
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {"gemini-5h": {"remaining_fraction": 1, "reset_in_seconds": -500}},
            }),
            "check_str_part": [f"5h {GREEN}0.0%{RESET}", "(0m)"],
        },
        {
            "id": "TC-85",
            "tier": "Tier 13: Live Refresh",
            "name": "A positive payload outranks a 0.0% cached API reading in an unexpired window",
            "setup_cache": lambda: {
                "version": CACHE_VERSION,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "last_api_fetch": time.time(),
                "quota": {
                    "gemini-5h": {"used_percent": 0.0, "source": "api",
                                  "fetched_at": time.time(),
                                  "resets_at": int(time.time()) + 14400 + BAND_SLACK},
                }
            },
            "payload": json.dumps({
                "model": gemini_model(),
                "quota": {
                    "gemini-5h": {
                        "remaining_fraction": 0.75,
                        "reset_in_seconds": 14400 + BAND_SLACK,
                        "reset_time": datetime.fromtimestamp(time.time() + 14400 + BAND_SLACK, tz=timezone.utc).isoformat()
                    }
                },
            }),
            "check_str_part": [f"5h {GREEN}25.0%{RESET}", "(4h00m)"],
            "check_absent_str_part": ["0.0%"],
        },
    ]



def build_unit_checks() -> list:
    """In-process checks for decisions a rendered line cannot show.

    Whether a background process was spawned, and how a timestamp was parsed,
    are invisible from stdout -- and the spawn is detached, so watching for the
    child is a race. These call the functions directly instead.
    """
    import statusline_hud as hud

    # The real clock, because the spawn gate also validates the token's expiry
    # and a synthetic epoch would make every fixture token look long dead.
    now = time.time()
    fresh_token = oauth_token(expires_in=3600)
    dead_token = oauth_token(expires_in=-3600)

    def spawn_decision(cache, token_data):
        """Whether maybe_trigger_bg_fetch would start a process for this cache.

        A spawned child inherits the environment, so USAGE_HUD_CACHE is pointed
        at a scratch file: otherwise the checks that do spawn would write their
        failed fetch straight into the user's real cache.
        """
        overrides = {"USAGE_HUD_DISABLE_BG_FETCH": None}
        previous = {k: os.environ.get(k) for k in
                    ("USAGE_HUD_DISABLE_BG_FETCH", "USAGE_HUD_TOKEN_PATH", "USAGE_HUD_CACHE")}
        try:
            with tempfile.TemporaryDirectory() as unit_dir:
                token_path = Path(unit_dir) / "token.json"
                token_path.write_text(json.dumps(token_data), encoding="utf-8")
                overrides["USAGE_HUD_TOKEN_PATH"] = str(token_path)
                overrides["USAGE_HUD_CACHE"] = str(Path(unit_dir) / "cache.json")
                for key, value in overrides.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value
                return hud.maybe_trigger_bg_fetch(cache, now)
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    due = {"last_api_fetch": now - 3600}

    def with_scratch_env(body, lock_age=None):
        """Runs body() with the cache and token env pointed at a scratch dir.

        The daemon lock lives beside the cache, so a lock fixture has to be
        created inside the same directory the spawn gate resolves
        USAGE_HUD_CACHE to. lock_age is None for no lock at all.
        """
        previous = {k: os.environ.get(k) for k in
                    ("USAGE_HUD_DISABLE_BG_FETCH", "USAGE_HUD_TOKEN_PATH", "USAGE_HUD_CACHE")}
        try:
            with tempfile.TemporaryDirectory() as unit_dir:
                token_path = Path(unit_dir) / "token.json"
                token_path.write_text(json.dumps(fresh_token), encoding="utf-8")
                os.environ.pop("USAGE_HUD_DISABLE_BG_FETCH", None)
                os.environ["USAGE_HUD_TOKEN_PATH"] = str(token_path)
                os.environ["USAGE_HUD_CACHE"] = str(Path(unit_dir) / "cache.json")
                if lock_age is not None:
                    lock_path = Path(hud.daemon_lock_path())
                    lock_path.write_text("", encoding="utf-8")
                    stamp = time.time() - lock_age
                    os.utime(lock_path, (stamp, stamp))
                return body()
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def file_age_roundtrip():
        """touch_file creates what is missing, and file_age dates it from now."""
        with tempfile.TemporaryDirectory() as unit_dir:
            path = os.path.join(unit_dir, "nested", "beat")
            hud.touch_file(path)
            age = hud.file_age(path, time.time())
            return os.path.isfile(path) and age is not None and 0 <= age < 5

    # --- Daemon lock ownership -------------------------------------------
    # flock(LOCK_EX|LOCK_NB) is the arbiter: the kernel picks exactly one
    # holder and drops the lock when that process dies. That is why there is no
    # stale-lock age heuristic here to get wrong -- two earlier designs (a
    # check-then-act touch, then a replace-then-read-back reclaim) each let two
    # processes believe they owned the lock, because both arbitrated on a path
    # rather than on the file they had inspected.

    claimant_src = (
        "import sys, time\n"
        "sys.path.insert(0, %r)\n"
        "import statusline_hud as h\n"
        "start = float(sys.argv[1])\n"
        "hold = float(sys.argv[2])\n"
        "while time.time() < start:\n"
        "    pass\n"
        "ok = h.acquire_daemon_lock()\n"
        "print('True' if ok else 'False', flush=True)\n"
        "if ok and hold > 0:\n"
        "    time.sleep(hold)\n"
    ) % str(HUD_DIR)

    def lock_owner():
        try:
            return Path(hud.daemon_lock_path()).read_text(encoding="utf-8").strip()
        except Exception:
            return None

    def lock_lab(body):
        """Runs body(spawn) against a scratch lock, always dropping our own.

        The held fd lives in a module global, so a check that acquired and did
        not release would hand the next check a lock it never asked for.
        """
        with tempfile.TemporaryDirectory() as unit_dir:
            script = Path(unit_dir) / "claim.py"
            script.write_text(claimant_src, encoding="utf-8")
            cache_path = Path(unit_dir) / "cache.json"
            child_env = dict(os.environ)
            child_env["USAGE_HUD_CACHE"] = str(cache_path)
            child_env["USAGE_HUD_DISABLE_BG_FETCH"] = "1"

            def spawn(start_at, hold=0.0):
                return subprocess.Popen(
                    [sys.executable, str(script), repr(start_at), repr(hold)],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    env=child_env, text=True)

            previous = os.environ.get("USAGE_HUD_CACHE")
            os.environ["USAGE_HUD_CACHE"] = str(cache_path)
            try:
                return body(spawn)
            finally:
                hud.release_daemon_lock()
                if previous is None:
                    os.environ.pop("USAGE_HUD_CACHE", None)
                else:
                    os.environ["USAGE_HUD_CACHE"] = previous

    def acquire_free_lock(spawn):
        return hud.acquire_daemon_lock() is True and lock_owner() == str(os.getpid())

    def refused_while_another_process_holds_it(spawn):
        child = spawn(time.time(), hold=5.0)
        try:
            if child.stdout.readline().strip() != "True":
                return False
            return hud.acquire_daemon_lock() is False
        finally:
            child.kill()
            child.wait(timeout=30)

    def dead_owner_lock_is_free(spawn):
        child = spawn(time.time(), hold=0.0)
        out, _err = child.communicate(timeout=60)
        if out.strip() != "True":
            return False
        # The file's mtime is seconds old, so every age heuristic would call it
        # live -- yet the kernel released the flock the instant the child died,
        # which is the whole point of using flock over a pid file.
        age = hud.file_age(hud.daemon_lock_path(), time.time())
        return (age is not None
                and age < hud.DAEMON_LOCK_STALE_SECONDS
                and hud.acquire_daemon_lock() is True)

    def release_hands_it_over(spawn):
        if hud.acquire_daemon_lock() is not True:
            return False
        hud.release_daemon_lock()
        child = spawn(time.time(), hold=0.0)
        out, _err = child.communicate(timeout=60)
        return out.strip() == "True"

    def no_fcntl_still_creates_the_lock(spawn):
        """A platform without fcntl must cost the daemon, not a process per render.

        maybe_trigger_bg_fetch suppresses a spawn on the lock file's mtime, and
        backs off on last_api_fetch -- but a daemon that dies before polling
        never advances either. If acquiring bails out before the lock file is
        created, nothing suppresses anything and every single render starts a
        doomed subprocess.
        """
        real = sys.modules.get("fcntl", "absent")
        sys.modules["fcntl"] = None          # makes `import fcntl` raise
        try:
            took = hud.acquire_daemon_lock()
        finally:
            if real == "absent":
                sys.modules.pop("fcntl", None)
            else:
                sys.modules["fcntl"] = real
        return took is False and os.path.isfile(hud.daemon_lock_path())

    def concurrent_claim_has_one_winner(spawn, rounds=3, claimants=16):
        """Many processes released together may produce exactly one winner.

        Sixteen, not eight: a weaker race reproduced the earlier defect only
        intermittently, which let a broken implementation pass three runs in a
        row. The winner holds the lock while the losers attempt theirs.
        """
        for _ in range(rounds):
            start_at = time.time() + 0.6
            procs = [spawn(start_at, hold=1.0) for _ in range(claimants)]
            winners = 0
            try:
                for proc in procs:
                    out, _err = proc.communicate(timeout=60)
                    if out.strip() == "True":
                        winners += 1
            finally:
                for proc in procs:
                    if proc.poll() is None:
                        proc.kill()
            if winners != 1:
                return False
        return True

    return [
        ("UC-01", "Nanosecond precision and a numeric offset parse",
         lambda: hud.parse_iso8601("2026-07-31T17:43:47.446579281+08:00") == 1785491027.446579),
        ("UC-02", "A trailing Z is read as UTC",
         lambda: hud.parse_iso8601("2026-08-05T01:32:05Z") == 1785893525.0),
        ("UC-03", "Junk timestamps yield None, not an exception",
         lambda: all(hud.parse_iso8601(v) is None for v in (None, "", "not-a-time", 17, {}))),
        ("UC-04", "A future expiry is usable",
         lambda: hud.token_is_usable(fresh_token, now) is True),
        ("UC-05", "A past expiry is not usable",
         lambda: hud.token_is_usable(dead_token, now) is False),
        ("UC-06", "An expiry inside the skew window is not usable",
         lambda: hud.token_is_usable(oauth_token(expires_in=10), now) is False),
        ("UC-07", "A token file with no access_token is not usable",
         lambda: hud.token_is_usable({"token": {"expiry": "2099-01-01T00:00:00Z"}}, now) is False),
        ("UC-08", "A fetch that is due spawns",
         lambda: spawn_decision(due, fresh_token) is True),
        ("UC-09", "A recent failure suppresses the spawn for API_ERROR_COOLDOWN",
         lambda: spawn_decision(dict(due, last_api_error=now - 5), fresh_token) is False),
        ("UC-10", "A failure older than the cooldown no longer suppresses it",
         lambda: spawn_decision(dict(due, last_api_error=now - hud.API_ERROR_COOLDOWN - 1),
                                fresh_token) is True),
        ("UC-11", "An expired token suppresses the spawn",
         lambda: spawn_decision(due, dead_token) is False),
        ("UC-12", "A fetch inside the poll interval does not spawn",
         lambda: spawn_decision({"last_api_fetch": now - 1}, fresh_token) is False),
        ("UC-13", "A failed background fetch still writes a re-readable cache",
         lambda: hud.base_cache({"last_api_fetch": now}, now).get("version") == hud.CACHE_VERSION),
        ("UC-14", "format_token_count formats sizes correctly (<1k, k, M, binary 1M/2M)",
         lambda: (
             hud.format_token_count(0) == "0"
             and hud.format_token_count(146) == "146"
             and hud.format_token_count(999) == "999"
             and hud.format_token_count(1000) == "1k"
             and hud.format_token_count(1500) == "1.5k"
             and hud.format_token_count(19477) == "19.5k"
             and hud.format_token_count(20000) == "20k"
             and hud.format_token_count(200000) == "200k"
             and hud.format_token_count(1000000) == "1M"
             and hud.format_token_count(1048576) == "1M"
             and hud.format_token_count(1500000) == "1.5M"
             and hud.format_token_count(2000000) == "2M"
             and hud.format_token_count(2097152) == "2M"
         )),
        ("UC-15", "format_token_count handles None, negative, and invalid values gracefully",
         lambda: (
             hud.format_token_count(None) == "0"
             and hud.format_token_count(-500) == "0"
             and hud.format_token_count("invalid") == "0"
         )),
        ("UC-16", "parse_context_window correctly extracts usage and bounds percentage",
         lambda: (
             hud.parse_context_window({
                 "context_window": {
                     "context_window_size": 1000000,
                     "current_usage": {"input_tokens": 150000, "output_tokens": 50000},
                 }
             }) == hud.ContextResult(used_tokens=200000, total_tokens=1000000, used_percent=20.0)
         )),
        ("UC-17", "parse_context_window handles missing or zero size gracefully",
         lambda: (
             hud.parse_context_window({}) is None
             and hud.parse_context_window({"context_window": {"context_window_size": 0}}) is None
             and hud.parse_context_window({"context_window": None}) is None
         )),
        ("UC-18", "render_context_window produces expected color codes and dim fallback",
         lambda: (
             hud.render_context_window(None) == f"Ctx {hud.COLOR_DIM}--{hud.COLOR_RESET}"
             and hud.render_context_window(hud.ContextResult(500000, 1000000, 50.0)) ==
                 f"Ctx {hud.COLOR_GREEN}500k{hud.COLOR_RESET}"
         )),
        ("UC-19", "file_age reports None for a path that does not exist",
         lambda: hud.file_age("/nonexistent/definitely/missing.beat", time.time()) is None),
        ("UC-20", "touch_file creates the file and file_age dates it from now",
         lambda: file_age_roundtrip() is True),
        ("UC-21", "A fresh daemon lock suppresses the spawn",
         lambda: with_scratch_env(lambda: hud.maybe_trigger_bg_fetch(due, time.time()),
                                  lock_age=5) is False),
        ("UC-22", "A lock older than DAEMON_LOCK_STALE_SECONDS no longer suppresses it",
         lambda: with_scratch_env(
             lambda: hud.maybe_trigger_bg_fetch(due, time.time()),
             lock_age=hud.DAEMON_LOCK_STALE_SECONDS + 5) is True),
        ("UC-23", "A render stamps the heartbeat even when no spawn is due",
         # A daemon started earlier reads this file to decide whether anyone is
         # still watching. Skipping the stamp on renders that do not spawn is
         # how it would starve itself while polls are on cooldown.
         lambda: with_scratch_env(lambda: (
             hud.maybe_trigger_bg_fetch({"last_api_fetch": time.time() - 1}, time.time()),
             os.path.isfile(hud.render_heartbeat_path()),
         )[1]) is True),
        ("UC-24", "An API reading outranks the payload for exactly as long as it is not stale",
         lambda: (hud.API_RESULT_MAX_AGE_SECONDS == hud.STALE_AFTER_SECONDS
                  and hud.API_ERROR_COOLDOWN < hud.API_RESULT_MAX_AGE_SECONDS)),
        ("UC-25", "A daemon lock outlives the longest possible poll iteration",
         lambda: hud.DAEMON_LOCK_STALE_SECONDS > hud.API_ERROR_COOLDOWN + 3),
        ("UC-26", "A cached absolute deadline anchors a payload describing the same window",
         lambda: hud.anchor_live_resets_at(
             {"resets_at": None, "reset_in_seconds": 10630},
             {"resets_at": int(now) + 9930, "source": "api"},
             now) == (int(now) + 9930, 10630)),
        ("UC-27", "A payload beyond the anchor tolerance re-anchors to the present",
         lambda: hud.anchor_live_resets_at(
             {"resets_at": None, "reset_in_seconds": 18030},
             {"resets_at": int(now) + 200, "source": "api"},
             now) == (int(round(now + 18030)), 18030)),
        ("UC-28", "Claiming a free daemon lock succeeds and records the holder's pid",
         lambda: lock_lab(acquire_free_lock) is True),
        ("UC-29", "A lock held by a live process is refused",
         lambda: lock_lab(refused_while_another_process_holds_it) is True),
        ("UC-30", "A lock left behind by a dead process needs no age heuristic to reclaim",
         lambda: lock_lab(dead_owner_lock_is_free) is True),
        ("UC-31", "Releasing hands the lock to another process",
         lambda: lock_lab(release_hands_it_over) is True),
        ("UC-32", "Exactly one of many racing processes takes the lock",
         lambda: lock_lab(concurrent_claim_has_one_winner) is True),
        ("UC-33", "Without fcntl the lock file is still created, so renders stop respawning",
         lambda: lock_lab(no_fcntl_still_creates_the_lock) is True),
        # --- Session-cumulative context window ------------------------------
        # agy's own field names do not settle whether its token counts are
        # cumulative or the current occupancy: in CAPTURED_IDLE,
        # used_percentage == total_input_tokens / context_window_size, while
        # current_usage.input_tokens is two orders larger. Summing only the
        # rises is correct either way -- a source that is already cumulative
        # never falls, and one that is occupancy falls only on a compaction,
        # which consumed nothing.
        ("UC-34", "A session with no history starts at what it observes",
         lambda: hud.accumulate_context("s1", 500, None, 1000)["s1"]
                 == {"cumulative_tokens": 500, "last_observed": 500, "last_seen": 1000}),
        ("UC-35", "A rising observation adds its delta",
         lambda: hud.accumulate_context(
             "s1", 800,
             {"s1": {"cumulative_tokens": 500, "last_observed": 500, "last_seen": 1}},
             1000)["s1"] == {"cumulative_tokens": 800, "last_observed": 800, "last_seen": 1000}),
        ("UC-36", "A drop adds nothing and re-floors the observation",
         # A compaction shrinks the window without spending anything.
         lambda: hud.accumulate_context(
             "s1", 50,
             {"s1": {"cumulative_tokens": 800, "last_observed": 800, "last_seen": 1}},
             1000)["s1"] == {"cumulative_tokens": 800, "last_observed": 50, "last_seen": 1000}),
        ("UC-37", "A rise after a drop adds only the rise",
         lambda: hud.accumulate_context(
             "s1", 120,
             {"s1": {"cumulative_tokens": 800, "last_observed": 50, "last_seen": 1}},
             1000)["s1"] == {"cumulative_tokens": 870, "last_observed": 120, "last_seen": 1000}),
        ("UC-38", "Concurrent sessions keep separate tallies",
         # One cache file serves every agy session on the machine. A single
         # slot keyed by one session_id meant two open sessions reset each
         # other's counter on every render.
         lambda: (lambda m: (m["s1"]["cumulative_tokens"] == 800
                             and m["s2"]["cumulative_tokens"] == 30))(
             hud.accumulate_context(
                 "s2", 30,
                 {"s1": {"cumulative_tokens": 800, "last_observed": 120, "last_seen": 1}},
                 1000))),
        ("UC-39", "A cumulative total is rendered without a window denominator",
         # Cumulative usage has no ceiling, so "/1M" would be a ratio of two
         # different things. The colour still tracks window occupancy.
         lambda: hud.render_context_window(
             hud.ContextResult(used_tokens=1_400_000, total_tokens=1048576, used_percent=12.0)
         ) == f"Ctx {hud.COLOR_GREEN}1.4M{hud.COLOR_RESET}"),
        ("UC-40", "A zero observation never re-floors a session that has spent tokens",
         # parse_context_window yields used_tokens=0 from a partially present
         # field set, which is indistinguishable from a genuine idle zero.
         # Re-flooring on it makes the next real reading count from zero again.
         lambda: hud.accumulate_context(
             "s1", 0,
             {"s1": {"cumulative_tokens": 1000, "last_observed": 1000, "last_seen": 1}},
             1000)["s1"]["last_observed"] == 1000),
        ("UC-41", "A real reading after a spurious zero is not double counted",
         lambda: hud.accumulate_context(
             "s1", 1200,
             hud.accumulate_context(
                 "s1", 0,
                 {"s1": {"cumulative_tokens": 1000, "last_observed": 1000, "last_seen": 1}},
                 1000),
             1001)["s1"]["cumulative_tokens"] == 1200),
        ("UC-42", "The tally stays an int rather than drifting into float",
         lambda: all(isinstance(v, int) for v in (
             hud.accumulate_context(
                 "s1", 800,
                 {"s1": {"cumulative_tokens": 500, "last_observed": 500, "last_seen": 1}},
                 1000)["s1"]["cumulative_tokens"],
             hud.accumulate_context("s1", 500, None, 1000)["s1"]["cumulative_tokens"]))),
        ("UC-43", "Tracked sessions are capped so the cache cannot grow forever",
         lambda: len(hud.accumulate_context(
             "new", 10,
             {str(i): {"cumulative_tokens": i, "last_observed": i, "last_seen": i}
              for i in range(hud.MAX_TRACKED_SESSIONS + 5)},
             10_000)) <= hud.MAX_TRACKED_SESSIONS),
        ("UC-44", "Eviction never drops the session being rendered",
         # last_seen has second resolution, so sessions rendering inside the
         # same second tie. Breaking that tie by insertion order evicted the
         # very session whose render triggered the write, resetting its tally.
         lambda: "new" in hud.accumulate_context(
             "new", 10,
             {str(i): {"cumulative_tokens": i, "last_observed": i, "last_seen": 10_000}
              for i in range(hud.MAX_TRACKED_SESSIONS + 5)},
             10_000)),
        ("UC-45", "A tie on last_seen still leaves exactly the cap",
         lambda: len(hud.accumulate_context(
             "new", 10,
             {str(i): {"cumulative_tokens": i, "last_observed": i, "last_seen": 10_000}
              for i in range(hud.MAX_TRACKED_SESSIONS + 5)},
             10_000)) == hud.MAX_TRACKED_SESSIONS),
        ("UC-46", "Explicit used_percentage in cw determines occupancy even when token counts present",
         lambda: hud.parse_context_window({
             "context_window": {
                 "context_window_size": 1000000,
                 "used_percentage": 85.5,
                 "current_usage": {"input_tokens": 10000, "output_tokens": 500},
             }
         }) == hud.ContextResult(used_tokens=10500, total_tokens=1000000, used_percent=85.5)),
        ("UC-47", "detect_quota_api_url respects environment override",
         lambda: (
             os.environ.__setitem__("USAGE_HUD_QUOTA_API_URL", "https://custom.googleapis.com/test"),
             (hud.detect_quota_api_url() == "https://custom.googleapis.com/test",
              os.environ.pop("USAGE_HUD_QUOTA_API_URL", None))[0]
         )[1]),
        ("UC-48", "detect_quota_api_url discovers endpoint from cli.log",
         lambda: (
             (lambda p: (
                 p.parent.mkdir(parents=True, exist_ok=True),
                 p.write_text("I0904 23:16:12 URL: https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist\n"),
                 os.environ.__setitem__("USAGE_HUD_CACHE", str(p.parent / "cache.json")),
                 hud.detect_quota_api_url() == "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"
             )[3])(Path(tempfile.mkdtemp()) / "cli.log")
         )),
        ("UC-49", "detect_quota_api_url falls back to DEFAULT_QUOTA_API_URL",
         lambda: (
             (lambda d: (
                 os.environ.__setitem__("USAGE_HUD_CACHE", str(Path(d) / "cache.json")),
                 hud.detect_quota_api_url() == hud.DEFAULT_QUOTA_API_URL
             )[1])(tempfile.mkdtemp())
         )),
        ("UC-50", "resolve_bucket prefers positive live payload over 0.0% API entry",
         lambda: (
             hud.resolve_bucket(
                 {"quota": {"gemini-5h": {"remaining_fraction": 0.8, "reset_in_seconds": 3600}}},
                 "gemini",
                 hud.FIVE_H_NAMES,
                 {"version": hud.CACHE_VERSION, "saved_at": int(now), "quota": {
                     "gemini-5h": {"used_percent": 0.0, "source": "api", "fetched_at": now, "resets_at": int(now) + 3600}
                 }},
                 now
             ).used_percent == 20.0
         )),
        ("UC-51", "write_cache updates cache when payload has positive usage and previous API entry is 0.0%",
         lambda: (
             (lambda d: (
                 os.environ.__setitem__("USAGE_HUD_CACHE", str(Path(d) / "cache.json")),
                 hud.write_cache(
                     "Gemini 3.8 Flash (High)",
                     {"5h": hud.BucketResult(
                         used_percent=25.0, reset_in_seconds=3600, resets_at=int(now) + 3600,
                         is_live=True, family="gemini", canonical_name="5h",
                         source=hud.SOURCE_PAYLOAD, is_stale=False, anchor_reset_in=3600
                     )},
                     {"version": hud.CACHE_VERSION, "saved_at": int(now), "quota": {
                         "gemini-5h": {"used_percent": 0.0, "source": "api", "fetched_at": now, "resets_at": int(now) + 3600}
                     }},
                     now
                 ),
                 hud.read_cache().get("quota", {}).get("gemini-5h", {}).get("used_percent") == 25.0
             )[2])(tempfile.mkdtemp())
         )),
    ]


def run_unit_checks() -> tuple:
    """Runs build_unit_checks, printing one line each. Returns (passed, failed)."""
    sys.path.insert(0, str(HUD_DIR))
    passed = failed = 0
    for check_id, name, check in build_unit_checks():
        try:
            ok = bool(check())
            reason = ""
        except Exception as e:
            ok = False
            reason = f"{type(e).__name__}: {e}"
        if ok:
            passed += 1
        else:
            failed += 1
        print(f"[{'PASS' if ok else 'FAIL'}] {check_id} (Tier 11: Units) - {name}")
        if reason:
            print(f"       Reason: {reason}")
    return passed, failed


def run_all_tests() -> bool:
    print("==================================================")
    print("AGY Statusline Boundary Test Suite")
    print("==================================================")

    test_cases = build_test_cases()
    passed_count = 0
    failed_count = 0

    with tempfile.TemporaryDirectory() as tmp_dir:
        for idx, tc in enumerate(test_cases):

            tc_id, tier, name = tc["id"], tc["tier"], tc["name"]
            
            cache_file_path = Path(tmp_dir) / f"cache_{idx}.json"

            # Built here rather than in build_test_cases: a cache whose
            # timestamps were computed before the preceding cases ran has
            # already aged by the time it is read, which is what made the
            # countdown assertions drift a minute and fail intermittently.
            if "setup_cache" in tc:
                setup_cache = tc["setup_cache"]
                if callable(setup_cache):
                    setup_cache = setup_cache()
                with open(cache_file_path, "w", encoding="utf-8") as f:
                    json.dump(setup_cache, f)
            elif "setup_raw_cache" in tc:
                with open(cache_file_path, "w", encoding="utf-8") as f:
                    f.write(tc["setup_raw_cache"])

            payload = tc["payload"]
            if callable(payload):
                payload = payload()

            # The suite must not depend on a reachable API or a valid OAuth
            # token; cases that exercise the fetch re-enable it explicitly.
            env = {"USAGE_HUD_CACHE": str(cache_file_path), "USAGE_HUD_DISABLE_BG_FETCH": "1"}

            if "setup_token" in tc:
                token_file_path = Path(tmp_dir) / f"token_{idx}.json"
                with open(token_file_path, "w", encoding="utf-8") as f:
                    json.dump(tc["setup_token"](), f)
                env["USAGE_HUD_TOKEN_PATH"] = str(token_file_path)

            env.update(tc.get("env") or {})
            out, err, code = run_statusline_test(payload, env=env, argv=tc.get("argv"))
            case_passed = True
            failure_reasons = []

            # 1. Zero exit code
            if code != 0:
                case_passed = False
                failure_reasons.append(f"Non-zero exit code: {code}")

            # 2. The TUI shares this terminal: nothing may land on stderr.
            if err:
                case_passed = False
                failure_reasons.append(f"Unexpected stderr: {err!r}")

            # 3. Pure ASCII
            is_ascii, non_ascii = verify_ascii(out)
            if not is_ascii:
                case_passed = False
                failure_reasons.append(f"Non-ASCII chars detected: {non_ascii}")

            plain = ANSI_REGEX.sub('', out)

            # 4. Expected substrings (raw, so ANSI colour codes can be asserted)
            for part in as_list(tc.get("check_str_part")):
                if part not in out:
                    case_passed = False
                    failure_reasons.append(f"Missing expected substring: {part!r}")

            # 5. Forbidden substrings, checked on the ANSI-stripped line so that
            #    escape-sequence bytes cannot mask or fake a match.
            for part in as_list(tc.get("check_absent_str_part")):
                if part in plain:
                    case_passed = False
                    failure_reasons.append(f"Unexpected substring present: {part!r}")

            # 6. Layout
            if "check_starts_with" in tc and not plain.startswith(tc["check_starts_with"]):
                case_passed = False
                failure_reasons.append(
                    f"Line does not start with {tc['check_starts_with']!r}: {plain[:70]!r}"
                )

            if tc.get("check_no_bar"):
                bar_chars = [c for c in plain if c in "[]"]
                if bar_chars:
                    case_passed = False
                    failure_reasons.append(
                        f"Progress-bar characters present after ANSI stripping: {bar_chars}"
                    )

            # 7. Model truncation
            if "check_model_max_len" in tc:
                model_match = re.search(r'\x1b\[1;36m(.*?)\x1b\[0m', out)
                if model_match:
                    extracted_model = model_match.group(1)
                    if len(extracted_model) > tc["check_model_max_len"]:
                        case_passed = False
                        failure_reasons.append(
                            f"Model name length {len(extracted_model)} > max "
                            f"{tc['check_model_max_len']}: {extracted_model!r}"
                        )

            # 8. Cache specific checks
            if tc.get("check_cache_exists") and not cache_file_path.exists():
                case_passed = False
                failure_reasons.append("Expected cache file to exist, but it was not created.")

            if ("check_cache_top_keys" in tc or "check_cache_bucket" in tc) and cache_file_path.exists():
                try:
                    c_data = json.loads(cache_file_path.read_text(encoding="utf-8"))
                except Exception as e:
                    c_data = None
                    case_passed = False
                    failure_reasons.append(f"Failed to read/parse cache file: {e}")

                for k in tc.get("check_cache_top_keys", []):
                    if not isinstance(c_data, dict) or k not in c_data:
                        case_passed = False
                        failure_reasons.append(f"Expected top-level cache key {k!r}, but not found.")

                for bucket_key, expected in (tc.get("check_cache_bucket") or {}).items():
                    entry = (c_data or {}).get("quota", {}).get(bucket_key)
                    if not isinstance(entry, dict):
                        case_passed = False
                        failure_reasons.append(f"Expected cached bucket {bucket_key!r}, but not found.")
                        continue
                    for field, want in expected.items():
                        if entry.get(field) != want:
                            case_passed = False
                            failure_reasons.append(
                                f"Cached bucket {bucket_key!r} field {field!r}: "
                                f"expected {want!r}, got {entry.get(field)!r}"
                            )

            if "check_cache_contains_keys" in tc and cache_file_path.exists():
                try:
                    c_data = json.loads(cache_file_path.read_text(encoding="utf-8"))
                    c_quota = c_data.get("quota", {})
                    for k in tc["check_cache_contains_keys"]:
                        if k not in c_quota:
                            case_passed = False
                            failure_reasons.append(f"Expected key {k!r} in cached quota, but not found.")
                except Exception as e:
                    case_passed = False
                    failure_reasons.append(f"Failed to read/parse cache file for keys check: {e}")

            if case_passed:
                passed_count += 1
                status_symbol = "PASS"
            else:
                failed_count += 1
                status_symbol = "FAIL"

            print(f"[{status_symbol}] {tc_id} ({tier}) - {name}")
            if not case_passed:
                for r in failure_reasons:
                    print(f"       Reason: {r}")
                print(f"       RAW Output: {out!r}")

    unit_passed, unit_failed = run_unit_checks()
    passed_count += unit_passed
    failed_count += unit_failed
    total = len(test_cases) + unit_passed + unit_failed

    print("\n==================================================")
    print(f"SUMMARY: Total: {total} | Passed: {passed_count} | Failed: {failed_count}")
    print("==================================================")

    return failed_count == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)


