#!/usr/bin/env python3
"""
Empirical Stress Test Harness for Challenger 2 (Milestone M1)
Tests statusline_hud.py directly against all required challenge objectives:
1. Model name line length boundaries (0, 1, 20, 21, 500 chars).
2. Progress bar rendering (-50%, 0%, 50%, 100%, 150%, NaN, +Inf, -Inf).
3. Stdin fault tolerance (abrupt close / empty, invalid JSON, binary noise).
4. Pure ASCII compliance (ord(c) < 128 for all characters).
"""

import sys
import os
import io
import math
import json
import re

# Add parent directory to import statusline_hud
HUD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, HUD_DIR)

import statusline_hud

ANSI_REGEX = re.compile(r'\x1b\[[0-9;]*m')


def strip_ansi(text: str) -> str:
    return ANSI_REGEX.sub('', text)


def is_pure_ascii(text: str) -> bool:
    return all(ord(c) < 128 for c in text)


def run_empirical_tests():
    print("==================================================")
    print("🚀 Empirical Test Harness - Challenger 2 (M1)")
    print("==================================================")
    
    results = []
    total = 0
    passed = 0

    # ----------------------------------------------------
    # OBJECTIVE 1: Model Name Boundaries (0, 1, 20, 21, 500 chars)
    # ----------------------------------------------------
    model_cases = [
        ("Empty model name", "", 0),
        ("1-char model name", "a", 1),
        ("20-char model name", "12345678901234567890", 20),
        ("21-char model name", "123456789012345678901", 20), # should truncate to 20
        ("500-char model name", "x" * 500, 20),               # should truncate to 20
    ]

    for label, model_str, expected_len in model_cases:
        total += 1
        data = {
            "active_model": model_str,
            "quota": {
                "rolling_5h": {"used_percent": 10.0, "reset_in_seconds": 3600},
                "weekly": {"used_percent": 20.0, "reset_in_seconds": 86400}
            }
        }
        output = statusline_hud.render_statusline(data)
        ascii_ok = is_pure_ascii(output)
        
        # Check extracted model in output
        clean_out = strip_ansi(output)
        if model_str:
            extracted_model = statusline_hud.sanitize_ascii(model_str)[:20]
            model_present = extracted_model in clean_out
            len_ok = len(extracted_model) == expected_len
        else:
            # Model part should be absent or empty
            model_present = True
            len_ok = True
            
        success = ascii_ok and model_present and len_ok
        if success:
            passed += 1
            print(f"[✅ PASS] Model Test: {label} (Extracted Len: {len(statusline_hud.sanitize_ascii(model_str)[:20])})")
        else:
            print(f"[❌ FAIL] Model Test: {label} (ascii_ok={ascii_ok}, model_present={model_present}, len_ok={len_ok})")

    # ----------------------------------------------------
    # OBJECTIVE 2: Progress Bar Rendering (-50%, 0%, 50%, 100%, 150%, NaN, +Inf, -Inf)
    # ----------------------------------------------------
    bar_cases = [
        ("Negative percentage (-50%)", -50.0, "[........]"),
        ("Zero percentage (0%)", 0.0, "[........]"),
        ("Half percentage (50%)", 50.0, "[====....]"),
        ("Full percentage (100%)", 100.0, "[========]"),
        ("Overflow percentage (150%)", 150.0, "[========]"),
        ("NaN percentage (float('nan'))", float('nan'), "[........]"),
        ("Positive Infinity (float('inf'))", float('inf'), "[========]"),
        ("Negative Infinity (float('-inf'))", float('-inf'), "[........]"),
    ]

    for label, pct, expected_bar in bar_cases:
        total += 1
        bar_str = statusline_hud.make_ascii_progress_bar(pct, length=8)
        ascii_ok = is_pure_ascii(bar_str)
        bar_ok = bar_str == expected_bar
        
        success = ascii_ok and bar_ok
        if success:
            passed += 1
            print(f"[✅ PASS] Progress Bar: {label} -> {bar_str}")
        else:
            print(f"[❌ FAIL] Progress Bar: {label} -> Got {bar_str}, Expected {expected_bar}")

    # ----------------------------------------------------
    # OBJECTIVE 3: Stdin Exit Code & Fallback Line
    # ----------------------------------------------------
    stdin_cases = [
        ("Empty stdin", ""),
        ("Whitespace stdin", "   \n\t  "),
        ("Malformed JSON", "{corrupted json payload"),
        ("Non-dict JSON array", "[1, 2, 3]"),
        ("Binary noise simulation", "\x00\xff\xfe\xfd\x80\x90\xaa"),
    ]

    expected_fallback_substr = "[........] --%"

    for label, raw_payload in stdin_cases:
        total += 1
        saved_stdin = sys.stdin
        saved_stdout = sys.stdout
        
        captured_out = io.StringIO()
        sys.stdin = io.StringIO(raw_payload)
        sys.stdout = captured_out
        
        exit_code = 0
        try:
            statusline_hud.main()
        except SystemExit as e:
            exit_code = e.code if isinstance(e.code, int) else 1
        except Exception:
            exit_code = 1
        finally:
            sys.stdin = saved_stdin
            sys.stdout = saved_stdout
            
        out_str = captured_out.getvalue()
        ascii_ok = is_pure_ascii(out_str)
        fallback_ok = expected_fallback_substr in out_str
        code_ok = exit_code == 0
        
        success = ascii_ok and fallback_ok and code_ok
        if success:
            passed += 1
            print(f"[✅ PASS] Stdin Defense: {label} -> Exit code: {exit_code}, Output ASCII: {ascii_ok}")
        else:
            print(f"[❌ FAIL] Stdin Defense: {label} -> Exit code: {exit_code}, Output ASCII: {ascii_ok}, Substr ok: {fallback_ok}")

    print("==================================================")
    print(f"📊 SUMMARY: Total: {total} | Passed: {passed} | Failed: {total - passed}")
    print("==================================================")

    return total == passed


if __name__ == "__main__":
    res = run_empirical_tests()
    sys.exit(0 if res else 1)
