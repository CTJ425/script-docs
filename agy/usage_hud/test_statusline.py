#!/usr/bin/env python3
"""
Expanded Automated Boundary Test Suite for AGY Pure-ASCII Statusline.
Validates code correctness, field compatibility, edge-case handling,
and 100% pure ASCII compliance across Tiers 1-5.
"""

import subprocess
import json
import re
import sys
from pathlib import Path

HUD_DIR = Path(__file__).parent.resolve()
SCRIPT_PATH = HUD_DIR / "statusline_hud.py"

# ANSI Escape code removal regex
ANSI_REGEX = re.compile(r'\x1b\[[0-9;]*m')


def run_statusline_test(payload_str: str) -> tuple[str, str, int]:
    """Runs statusline_hud.py passing payload_str via stdin."""
    p = subprocess.Popen(
        [sys.executable, str(SCRIPT_PATH)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
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


def run_all_tests() -> bool:
    print("==================================================")
    print("🧪 AGY Statusline Expanded Automated Boundary Test Suite")
    print("==================================================")

    test_cases = [
        # --- TIER 1: Core Usage & Indicator Formatting ---
        {
            "id": "TC-01",
            "tier": "Tier 1: Core",
            "name": "Standard Usage & Green Indicator (<70%)",
            "payload": json.dumps({
                "active_model": "gemini-3.6-flash",
                "quota": {
                    "rolling_5h": {"used_percent": 35.0, "reset_in_seconds": 5400},
                    "weekly": {"used_percent": 50.0, "reset_in_seconds": 172800}
                }
            }),
            "check_str_part": "5h: \033[1;32m[===.....] 35.0%\033[0m",
            "check_color": "\033[1;32m"
        },
        {
            "id": "TC-02",
            "tier": "Tier 1: Core",
            "name": "Warning Usage & Yellow Indicator (70% ~ 90%)",
            "payload": json.dumps({
                "active_model": "gemini-3.6-pro",
                "quota": {
                    "rolling_5h": {"used_percent": 75.5, "reset_in_seconds": 3600},
                    "weekly": {"used_percent": 88.0, "reset_in_seconds": 86400}
                }
            }),
            "check_color": "\033[1;33m"
        },
        {
            "id": "TC-03",
            "tier": "Tier 1: Core",
            "name": "Critical Usage & Red Indicator (>=90%)",
            "payload": json.dumps({
                "active_model": "gemini-3.6-flash",
                "quota": {
                    "rolling_5h": {"used_percent": 95.2, "reset_in_seconds": 1200},
                    "weekly": {"used_percent": 98.0, "reset_in_seconds": 43200}
                }
            }),
            "check_color": "\033[1;31m"
        },

        # --- TIER 2: Field Variations & Compatibility ---
        {
            "id": "TC-04",
            "tier": "Tier 2: Compatibility",
            "name": "Legacy Field Conversion (remaining_fraction)",
            "payload": json.dumps({
                "active_model": "claude-3-5-sonnet",
                "quota": {
                    "5h": {"remaining_fraction": 0.40, "reset_in": 7200},
                    "week": {"remaining_fraction": 0.10, "reset_in": 259200}
                }
            }),
            "check_str_part": "60.0%"
        },
        {
            "id": "TC-05",
            "tier": "Tier 2: Compatibility",
            "name": "Alternative Key Schema (5h, week, model)",
            "payload": json.dumps({
                "model": "gpt-4o",
                "quota": {
                    "5h": {"used_percent": 20.0, "reset_in_seconds": 1800},
                    "week": {"used_percent": 40.0, "reset_in_seconds": 36000}
                }
            }),
            "check_str_part": "gpt-4o"
        },

        # --- TIER 3: Boundary Values & Input Sanitization ---
        {
            "id": "TC-06",
            "tier": "Tier 3: Boundary",
            "name": "Overlong Model Name Truncation (>20 chars)",
            "payload": json.dumps({
                "active_model": "claude-3-5-sonnet-20241022-v1:0",
                "quota": {
                    "rolling_5h": {"used_percent": 10.0, "reset_in_seconds": 3600},
                    "weekly": {"used_percent": 20.0, "reset_in_seconds": 86400}
                }
            }),
            "check_model_max_len": 20,
            "check_str_part": "claude-3-5-sonnet-20"
        },
        {
            "id": "TC-07",
            "tier": "Tier 3: Boundary",
            "name": "Pure ASCII Sanitization of Non-ASCII Input",
            "payload": json.dumps({
                "active_model": "gemini-3.6-⚡-pro-中文",
                "quota": {
                    "rolling_5h": {"used_percent": 50.0, "reset_in_seconds": 3600},
                    "weekly": {"used_percent": 50.0, "reset_in_seconds": 86400}
                }
            }),
            "enforce_ascii_only_input": True
        },
        {
            "id": "TC-08",
            "tier": "Tier 3: Boundary",
            "name": "Percentage Clamping Underflow (<0%)",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": -15.0, "reset_in_seconds": 3600},
                    "weekly": {"used_percent": 0.0, "reset_in_seconds": 3600}
                }
            }),
            "check_str_part": "0.0%"
        },
        {
            "id": "TC-09",
            "tier": "Tier 3: Boundary",
            "name": "Percentage Clamping Overflow (>100%)",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 125.0, "reset_in_seconds": 3600},
                    "weekly": {"used_percent": 100.0, "reset_in_seconds": 3600}
                }
            }),
            "check_str_part": "100.0%"
        },
        {
            "id": "TC-10",
            "tier": "Tier 3: Boundary",
            "name": "Negative Reset Time Handling (-500s)",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 0.0, "reset_in_seconds": -500},
                    "weekly": {"used_percent": 0.0, "reset_in_seconds": -100}
                }
            }),
            "check_str_part": "(0m)"
        },
        {
            "id": "TC-11",
            "tier": "Tier 3: Boundary",
            "name": "Float String Reset Time Parsing (\"3600.5\")",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 10.0, "reset_in_seconds": "3600.5"},
                    "weekly": {"used_percent": 10.0, "reset_in_seconds": "7200.0"}
                }
            }),
            "check_str_part": "(1h00m)"
        },
        {
            "id": "TC-12",
            "tier": "Tier 3: Boundary",
            "name": "Missing & None Reset Field Robustness",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 10.0},
                    "weekly": {"used_percent": 10.0, "reset_in_seconds": None}
                }
            }),
            "check_str_part": "(0m)"
        },
        {
            "id": "TC-13",
            "tier": "Tier 3: Boundary",
            "name": "Abnormal Reset Values (Infinity / NaN String)",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 10.0, "reset_in_seconds": "inf"},
                    "weekly": {"used_percent": 10.0, "reset_in_seconds": "nan"}
                }
            }),
            "check_str_part": "(0m)"
        },

        # --- TIER 4: Malformed Payload & Error Defense ---
        {
            "id": "TC-14",
            "tier": "Tier 4: Defense",
            "name": "Empty Stdin Payload Handling",
            "payload": "",
            "check_str_part": "[........] --%"
        },
        {
            "id": "TC-15",
            "tier": "Tier 4: Defense",
            "name": "Invalid JSON Syntax Fault Tolerance",
            "payload": "{invalid json syntax payload...",
            "check_str_part": "[........] --%"
        },
        {
            "id": "TC-16",
            "tier": "Tier 4: Defense",
            "name": "Non-Dict JSON Array Payload Defense ([1,2,3])",
            "payload": json.dumps([1, 2, 3, "corrupted"]),
            "check_str_part": "[........] --%"
        },
        {
            "id": "TC-17",
            "tier": "Tier 4: Defense",
            "name": "Non-Dict JSON Primitive Defense (\"string_payload\")",
            "payload": json.dumps("raw_string_payload"),
            "check_str_part": "[........] --%"
        },
        {
            "id": "TC-18",
            "tier": "Tier 4: Defense",
            "name": "Empty JSON Dict Handling ({})",
            "payload": json.dumps({}),
            "check_str_part": "5h: ",
            # An empty payload tells us nothing about usage; reporting 0.0%
            # would read as "quota barely touched", which we cannot claim.
            "check_absent_str_part": " 0.0%"
        },

        # --- TIER 5: Unknown vs Zero (missing data must never render as 0%) ---
        {
            "id": "TC-19",
            "tier": "Tier 5: Unknown",
            "name": "Missing Weekly Bucket Renders --% Not 0.0%",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 35.0, "reset_in_seconds": 5400}
                }
            }),
            "check_str_part": "Wk: \033[2m[........] --%\033[0m",
            "check_absent_str_part": " 0.0%"
        },
        {
            "id": "TC-20",
            "tier": "Tier 5: Unknown",
            "name": "Bucket Present But No Usage Field Renders --%",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"reset_in_seconds": 5400},
                    "weekly": {"used_percent": 40.0, "reset_in_seconds": 86400}
                }
            }),
            "check_str_part": "5h: \033[2m[........] --%\033[0m",
            "check_absent_str_part": " 0.0%"
        },
        {
            "id": "TC-21",
            "tier": "Tier 5: Unknown",
            "name": "Unparseable Percentage Renders --% Not 0.0%",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": "not-a-number", "reset_in_seconds": 5400},
                    "weekly": {"used_percent": 40.0, "reset_in_seconds": 86400}
                }
            }),
            "check_str_part": "5h: \033[2m[........] --%\033[0m",
            "check_absent_str_part": " 0.0%"
        },
        {
            "id": "TC-22",
            "tier": "Tier 5: Unknown",
            "name": "Genuine Zero Usage Still Renders 0.0%",
            "payload": json.dumps({
                "active_model": "test-model",
                "quota": {
                    "rolling_5h": {"used_percent": 0.0, "reset_in_seconds": 5400},
                    "weekly": {"used_percent": 0.0, "reset_in_seconds": 86400}
                }
            }),
            "check_str_part": " 0.0%",
            "check_absent_str_part": "--%"
        }
    ]

    passed_count = 0
    failed_count = 0
    results = []

    for tc in test_cases:
        tc_id = tc["id"]
        tier = tc["tier"]
        name = tc["name"]
        payload = tc["payload"]

        out, err, code = run_statusline_test(payload)
        case_passed = True
        failure_reasons = []

        # 1. Zero Exit Code Assertion
        if code != 0:
            case_passed = False
            failure_reasons.append(f"Non-zero exit code: {code}")

        # 2. Pure ASCII Verification
        is_ascii, non_ascii = verify_ascii(out)
        if not is_ascii:
            case_passed = False
            failure_reasons.append(f"Non-ASCII chars detected: {non_ascii}")

        # 3. Check expected string part
        if "check_str_part" in tc and tc["check_str_part"] not in out:
            case_passed = False
            failure_reasons.append(f"Missing expected substring: {repr(tc['check_str_part'])}")

        # 3b. Check a substring is absent (e.g. "unknown" must not print as 0.0%)
        if "check_absent_str_part" in tc and tc["check_absent_str_part"] in out:
            case_passed = False
            failure_reasons.append(
                f"Unexpected substring present: {repr(tc['check_absent_str_part'])}"
            )

        # 4. Check color code
        if "check_color" in tc and tc["check_color"] not in out:
            case_passed = False
            failure_reasons.append(f"Missing expected ANSI color code: {repr(tc['check_color'])}")

        # 5. Check model truncation
        if "check_model_max_len" in tc:
            # Model part after '|' in stdout
            model_match = re.search(r'\|\s*\x1b\[1;36m(.*?)\x1b\[0m', out)
            if model_match:
                extracted_model = model_match.group(1)
                if len(extracted_model) > tc["check_model_max_len"]:
                    case_passed = False
                    failure_reasons.append(
                        f"Model name length {len(extracted_model)} > max {tc['check_model_max_len']}: {repr(extracted_model)}"
                    )

        if case_passed:
            passed_count += 1
            status_symbol = "✅ PASS"
        else:
            failed_count += 1
            status_symbol = "❌ FAIL"

        results.append({
            "id": tc_id,
            "tier": tier,
            "name": name,
            "status": status_symbol,
            "output": out,
            "reasons": failure_reasons
        })

        print(f"[{status_symbol}] {tc_id} ({tier}) - {name}")
        if not case_passed:
            for r in failure_reasons:
                print(f"       Reason: {r}")
            print(f"       RAW Output: {repr(out)}")

    print("\n==================================================")
    print(f"📊 SUMMARY: Total: {len(test_cases)} | Passed: {passed_count} | Failed: {failed_count}")
    print("==================================================")

    return failed_count == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
