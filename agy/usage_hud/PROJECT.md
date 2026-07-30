# Project: AGY Pure-ASCII Usage Statusline

## Architecture
- `statusline_hud.py`: Reads JSON payload from stdin, parses 5h & Weekly quota usage, formats progress bars, truncates model names, strips non-ASCII characters, and outputs ANSI-colored pure ASCII statusline to stdout.
- `test_statusline.py`: Automated test runner verifying statusline logic, pure ASCII compliance, boundary conditions, and edge-case handling via `subprocess.Popen`.
- `setup.sh`: One-click setup script granting execute permissions and executing test suite.
- `USER_GUIDE.md`: Traditional Chinese user manual covering setup, settings.json integration, TUI dynamic options, statusline rendering, and verification.
- `TROUBLESHOOTING.md`: Traditional Chinese troubleshooting manual providing diagnostic trees, common issue matrix, payload debugging tools, and regression maintenance.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Pure ASCII Output & Character Filtering | Ensure 100% pure ASCII output (ord < 128) and strip non-ASCII characters from model names/strings. | M1 | Survey |
| 2 | Model Name Truncation | Truncate AI model names over 20 characters to prevent visual line wrapping. | M1 | Survey |
| 3 | Float & Timestamp Robustness | Handle `inf`, `NaN`, string reset times ("3600.5"), negative reset times, and missing reset fields without crashing. | M1 | Survey |
| 4 | Non-Dict & Malformed JSON Defense | Guard against non-dict JSON payloads (e.g. lists, primitives) and malformed syntax gracefully. | M1 | Survey |
| 5 | Expanded Boundary Test Suite | Expand test suite to 18 boundary test cases covering all edge cases, NaN/inf, truncation, ASCII compliance, and malformed inputs. | E2E Track | Survey |
| 6 | E2E Test Infra & Verification Harness | Create `TEST_INFRA.md` and `TEST_READY.md` tracking tier 1-4 coverage and test execution. | E2E Track | Survey |
| 7 | Traditional Chinese User Manual | Create comprehensive `USER_GUIDE.md` in Traditional Chinese with settings.json integration and one-click verification. | M2 | Survey |
| 8 | Traditional Chinese Troubleshooting Manual | Create detailed `TROUBLESHOOTING.md` in Traditional Chinese with diagnostic tree, issue matrix, and payload capture guide. | M2 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Robustness & Edge Case Fixes | Defensive updates in `statusline_hud.py` (model truncation, ASCII sanitization, float inf/nan, non-dict defense) | None | DONE |
| E2E | Expanded E2E Test Suite & Infra | Expand `test_statusline.py` to 18 boundary test cases, write `TEST_INFRA.md` and publish `TEST_READY.md` | M1 (interface contract) | DONE |
| M2 | Traditional Chinese User & Troubleshooting Manuals | Write `USER_GUIDE.md` (6 chapters) and `TROUBLESHOOTING.md` (4 chapters) | M1, E2E | DONE |
| Final | Final Integration & Adversarial Hardening | Pass 100% E2E test suite + Tier 5 adversarial coverage hardening | M1, M2, E2E | DONE |

## Interface Contracts
### `statusline_hud.py` I/O Contract
- **Input**: UTF-8 encoded JSON payload from `sys.stdin`.
- **Expected Keys**: `quota` (`5h`, `weekly` objects with `used_percent` / `remaining_fraction` / `reset_in_seconds` / `reset_time`), `active_model` / `model`.
- **Output**: Exactly one line of ANSI-colored pure ASCII text printed to `sys.stdout`.
- **ASCII Constraint**: Every character printed (excluding ANSI escape sequences `\033[...]`) must have ASCII ordinal value strictly less than 128 (`ord(c) < 128`).
- **Model Truncation**: Model name strictly truncated to max 20 characters before color formatting.
- **Error Behavior**: On empty input, invalid JSON, or exceptions, print fallback line `5h: [........] --% | Wk: [........] --%` with exit code 0. Never crash or raise unhandled exceptions.

## Code Layout
- `statusline_hud.py`: Core CLI interpreter
- `test_statusline.py`: Boundary test suite runner
- `setup.sh`: Setup & test invocation script
- `USER_GUIDE.md`: Traditional Chinese User Manual
- `TROUBLESHOOTING.md`: Traditional Chinese Troubleshooting Manual
- `TEST_INFRA.md`: E2E Test Architecture & Plan
- `TEST_READY.md`: E2E Test Suite Ready Signal & Matrix
