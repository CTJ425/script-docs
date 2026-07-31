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


def gemini_model(display_name="Gemini 3.6 Flash (High)"):
    return {"id": display_name, "display_name": display_name, "effort": "high"}


def run_statusline_test(payload_str: str, env: dict = None) -> tuple[str, str, int]:
    """Runs statusline_hud.py passing payload_str via stdin."""
    run_env = dict(os.environ)
    if env is not None:
        run_env.update(env)
    p = subprocess.Popen(
        [sys.executable, str(SCRIPT_PATH)],
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
            "name": "Captured 'idle' payload renders model and both windows",
            "payload": json.dumps(CAPTURED_IDLE),
            # gemini-5h     1 - 0.9986155 -> 0.1%,  11515s -> 3h11m
            # gemini-weekly 1 - 0.8492495 -> 15.1%, 431793s -> 4d23h
            "check_starts_with": "Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)",
            "check_absent_str_part": ["--%", "{", "'id'"],
        },
        {
            "id": "TC-02",
            "tier": "Tier 0: Captured",
            "name": "Captured 'authenticating' payload (model null, no quota)",
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_starts_with": "5h --%",
            "check_absent_str_part": ["0.0%", "None"],
        },
        {
            "id": "TC-03",
            "tier": "Tier 0: Captured",
            "name": "Captured 'initializing' payload (model set, quota not yet sent)",
            "payload": json.dumps(CAPTURED_INITIALIZING),
            "check_starts_with": "Gemini 3.6 Flash (High) | 5h --% | Wk --%",
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
                "context_window": {"used_percentage": 42.0, "remaining_percentage": 58.0},
            }),
            "check_str_part": [f"5h {DIM}--%{RESET}", f"Wk {DIM}--%{RESET}"],
            "check_absent_str_part": ["42.0%", "58.0%"],
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
            "check_starts_with": "5h --%",
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
            "check_starts_with": "5h --%",
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
            "check_str_part": f"5h {DIM}--%{RESET}",
        },
        {
            "id": "TC-34",
            "tier": "Tier 6: Defence",
            "name": "Invalid JSON syntax",
            "payload": "{invalid json syntax payload...",
            "check_str_part": f"5h {DIM}--%{RESET}",
        },
        {
            "id": "TC-35",
            "tier": "Tier 6: Defence",
            "name": "JSON array payload",
            "payload": json.dumps([1, 2, 3, "corrupted"]),
            "check_str_part": f"5h {DIM}--%{RESET}",
        },
        {
            "id": "TC-36",
            "tier": "Tier 6: Defence",
            "name": "JSON primitive payload",
            "payload": json.dumps("raw_string_payload"),
            "check_str_part": f"5h {DIM}--%{RESET}",
        },
        {
            "id": "TC-37",
            "tier": "Tier 6: Defence",
            "name": "Empty JSON object",
            "payload": json.dumps({}),
            "check_starts_with": "5h ",
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
            "name": "Model-less line starts directly with the 5h window",
            "payload": json.dumps({
                "quota": {
                    "gemini-5h": {"remaining_fraction": 0.65, "reset_in_seconds": 5400},
                    "gemini-weekly": {"remaining_fraction": 0.50, "reset_in_seconds": 172800},
                },
            }),
            "check_starts_with": "5h 35.0%",
            "check_no_bar": True,
        },

        # --- TIER 9: Cold-start cache & dynamic time-rolling ---------------
        {
            "id": "TC-48",
            "tier": "Tier 9: Cache",
            "name": "Cold-start cache write on valid payload",
            "payload": json.dumps(CAPTURED_IDLE),
            "check_cache_exists": True,
            "check_starts_with": "Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)",
        },
        {
            "id": "TC-49",
            "tier": "Tier 9: Cache",
            "name": "Cold-start fallback reads cached model and quota when payload authenticating",
            "setup_cache": {
                "version": 1,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 12.3, "resets_at": int(time.time()) + 3605},
                    "gemini-weekly": {"used_percent": 45.6, "resets_at": int(time.time()) + 86405},
                }
            },
            "payload": json.dumps(CAPTURED_AUTHENTICATING),
            "check_starts_with": "Gemini 3.6 Flash (High) | 5h 12.3% (1h00m) | Wk 45.6% (1d00h)",
        },
        {
            "id": "TC-50",
            "tier": "Tier 9: Cache",
            "name": "Dynamic time-rolling countdown recalculates against system clock",
            "setup_cache": {
                "version": 1,
                "saved_at": int(time.time()) - 300,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 20.0, "resets_at": int(time.time()) + 3305},
                    "gemini-weekly": {"used_percent": 30.0, "resets_at": int(time.time()) + 86105},
                }
            },
            "payload": json.dumps({"agent_state": "idle"}),
            "check_str_part": ["(55m)", "(23h55m)"],
        },
        {
            "id": "TC-51",
            "tier": "Tier 9: Cache",
            "name": "Window rollover: past resets_at renders 0.0% with no countdown",
            "setup_cache": {
                "version": 1,
                "saved_at": int(time.time()) - 1000,
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "gemini-5h": {"used_percent": 88.0, "resets_at": int(time.time()) - 100},
                    "gemini-weekly": {"used_percent": 50.0, "resets_at": int(time.time()) + 3600},
                }
            },
            "payload": json.dumps({"agent_state": "idle"}),
            "check_str_part": f"5h {GREEN}0.0%{RESET}",
            "check_absent_str_part": "88.0%",
        },
        {
            "id": "TC-52",
            "tier": "Tier 9: Cache",
            "name": "Expired cache (>7 days) is ignored and falls back to --%",
            "setup_cache": {
                "version": 1,
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
            "setup_cache": {
                "version": 1,
                "saved_at": int(time.time()),
                "model": "Gemini 3.6 Flash (High)",
                "quota": {
                    "3p-5h": {"used_percent": 99.0, "resets_at": int(time.time()) + 3600},
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
            "check_starts_with": "Gemini 3.6 Flash (High) | 5h 15.0% (30m) | Wk --%",
        },
    ]


def run_all_tests() -> bool:
    print("==================================================")
    print("AGY Statusline Boundary Test Suite")
    print("==================================================")

    test_cases = build_test_cases()
    passed_count = 0
    failed_count = 0

    # Ensure user home default cache is cleaned up before testing
    default_user_cache = Path.home() / ".gemini" / "antigravity-cli" / "usage_hud_cache.json"
    if default_user_cache.exists():
        try:
            default_user_cache.unlink()
        except Exception:
            pass

    with tempfile.TemporaryDirectory() as tmp_dir:
        for idx, tc in enumerate(test_cases):
            tc_id, tier, name = tc["id"], tc["tier"], tc["name"]
            
            cache_file_path = Path(tmp_dir) / f"cache_{idx}.json"
            
            if "setup_cache" in tc:
                with open(cache_file_path, "w", encoding="utf-8") as f:
                    json.dump(tc["setup_cache"], f)
            elif "setup_raw_cache" in tc:
                with open(cache_file_path, "w", encoding="utf-8") as f:
                    f.write(tc["setup_raw_cache"])

            env = {"USAGE_HUD_CACHE": str(cache_file_path)}
            out, err, code = run_statusline_test(tc["payload"], env=env)
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

    print("\n==================================================")
    print(f"SUMMARY: Total: {len(test_cases)} | Passed: {passed_count} | Failed: {failed_count}")
    print("==================================================")

    return failed_count == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)


