#!/usr/bin/env python3
"""
Adversarial Stress Test Harness for statusline_hud.py
Constructed by Challenger 1 for M1 Core Robustness Verification.
"""

import sys
import io
import json
import re
import math
from pathlib import Path

# Add project root to sys.path
PROJECT_DIR = Path(__file__).parent.parent.parent.resolve()
sys.path.insert(0, str(PROJECT_DIR))

import statusline_hud

ANSI_REGEX = re.compile(r'\x1b\[[0-9;]*m')

def verify_ascii_output(text: str) -> tuple[bool, list]:
    clean_text = ANSI_REGEX.sub('', text)
    non_ascii = [(c, ord(c)) for c in clean_text if ord(c) >= 128]
    return len(non_ascii) == 0, non_ascii

def run_harness_test(name: str, payload_raw: str) -> dict:
    saved_stdin = sys.stdin
    saved_stdout = sys.stdout
    
    sys.stdin = io.StringIO(payload_raw)
    stdout_buf = io.StringIO()
    sys.stdout = stdout_buf
    
    exception_thrown = None
    output = ""
    try:
        statusline_hud.main()
        output = stdout_buf.getvalue()
    except Exception as e:
        exception_thrown = e
    finally:
        sys.stdin = saved_stdin
        sys.stdout = saved_stdout

    if exception_thrown is not None:
        return {
            "name": name,
            "passed": False,
            "reason": f"Unhandled exception raised: {type(exception_thrown).__name__}: {exception_thrown}",
            "output": output
        }

    is_ascii, non_ascii = verify_ascii_output(output)
    if not is_ascii:
        return {
            "name": name,
            "passed": False,
            "reason": f"Non-ASCII characters detected in output: {non_ascii}",
            "output": output
        }

    if not output.endswith('\n') and len(output) > 0:
        pass # print() appends \n

    return {
        "name": name,
        "passed": True,
        "reason": "OK",
        "output": output.strip()
    }

def execute_all_stress_tests():
    test_cases = []

    # Category 1: Extremely Large JSON Payloads (>1MB)
    large_str = "A" * 1_200_000
    test_cases.append((
        "CAT1-01: >1MB JSON Array Payload",
        json.dumps([large_str[:1000] for _ in range(1200)])
    ))
    test_cases.append((
        "CAT1-02: >1MB JSON Dict with Overlong Strings",
        json.dumps({
            "active_model": large_str,
            "quota": {
                "rolling_5h": {"used_percent": 45.0, "reset_in_seconds": 3600},
                "weekly": {"used_percent": 80.0, "reset_in_seconds": 86400}
            }
        })
    ))

    # Category 2: Deeply Nested Arrays & Invalid Types
    test_cases.append((
        "CAT2-01: Array of Quotas",
        json.dumps([{"quota": {"rolling_5h": {"used_percent": 50.0}}}])
    ))
    test_cases.append((
        "CAT2-02: Primitive Integer Payload",
        "12345"
    ))
    test_cases.append((
        "CAT2-03: Primitive Boolean Payload",
        "true"
    ))
    test_cases.append((
        "CAT2-04: Primitive Null Payload",
        "null"
    ))
    test_cases.append((
        "CAT2-05: Non-dict Quota Value (String)",
        json.dumps({"quota": "invalid_quota_string"})
    ))
    test_cases.append((
        "CAT2-06: Non-dict 5h Value (Integer)",
        json.dumps({"quota": {"rolling_5h": 99999}})
    ))
    test_cases.append((
        "CAT2-07: Non-string Model Name (List)",
        json.dumps({"active_model": [1, 2, 3], "quota": {}})
    ))
    test_cases.append((
        "CAT2-08: Non-string Model Name (Dict)",
        json.dumps({"active_model": {"model_id": "gpt-4"}, "quota": {}})
    ))

    # Category 3: Complex Non-ASCII UTF-8 Sequences
    test_cases.append((
        "CAT3-01: Emojis & Zero-Width Joiners in Model Name",
        json.dumps({
            "active_model": "gemini-3.6-⚡-pro-👨‍👩‍👧‍👦-🔥",
            "quota": {"5h": {"used_percent": 10.0, "reset_in_seconds": 100}}
        })
    ))
    test_cases.append((
        "CAT3-02: CJK Full-Width Characters in Model Name",
        json.dumps({
            "active_model": "繁體中文測試模型ＡＢＣ１２３",
            "quota": {"5h": {"used_percent": 50.0, "reset_in_seconds": 200}}
        })
    ))
    test_cases.append((
        "CAT3-03: Mixed Non-ASCII UTF-8 Keys and Values",
        json.dumps({
            "測試鍵": "測試值",
            "active_model": "test-🚀-model",
            "quota": {"rolling_5h": {"used_percent": 99.9, "reset_in_seconds": 0}}
        })
    ))

    # Category 4: Extreme Floating Point Values
    test_cases.append((
        "CAT4-01: Extreme Positive Float (1e308)",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": 1e308, "reset_in_seconds": 1e308},
                "weekly": {"used_percent": 1e308, "reset_in_seconds": 1e308}
            }
        })
    ))
    test_cases.append((
        "CAT4-02: Extreme Negative Float (-1e308)",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": -1e308, "reset_in_seconds": -1e308},
                "weekly": {"used_percent": -1e308, "reset_in_seconds": -1e308}
            }
        })
    ))
    test_cases.append((
        "CAT4-03: NaN / Inf Strings in Reset and Percentage",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": "nan", "reset_in_seconds": "inf"},
                "weekly": {"used_percent": "-nan", "reset_in_seconds": "-inf"}
            }
        })
    ))

    # Category 5: String Float Timestamps
    test_cases.append((
        "CAT5-01: Positive Float String Timestamp ('123.456')",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": "25.5", "reset_in_seconds": "123.456"}
            }
        })
    ))
    test_cases.append((
        "CAT5-02: Negative Zero Float String Timestamp ('-0.0')",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": "0.0", "reset_in_seconds": "-0.0"}
            }
        })
    ))
    test_cases.append((
        "CAT5-03: Sub-second Float String Timestamp ('0.0001')",
        json.dumps({
            "quota": {
                "rolling_5h": {"used_percent": "10.0", "reset_in_seconds": "0.0001"}
            }
        })
    ))

    results = []
    all_passed = True
    for name, payload in test_cases:
        res = run_harness_test(name, payload)
        results.append(res)
        if not res["passed"]:
            all_passed = False

    return all_passed, results

if __name__ == "__main__":
    all_passed, results = execute_all_stress_tests()
    print("=" * 60)
    print("ADVERSARIAL STRESS TEST HARNESS RESULTS")
    print("=" * 60)
    for r in results:
        status = "✅ PASS" if r["passed"] else "❌ FAIL"
        print(f"[{status}] {r['name']}")
        print(f"       Output: {r['output']}")
        if not r["passed"]:
            print(f"       Reason: {r['reason']}")
    print("=" * 60)
    print(f"OVERALL STATUS: {'PASSED ALL TESTS' if all_passed else 'FAILED SOME TESTS'}")
    sys.exit(0 if all_passed else 1)
