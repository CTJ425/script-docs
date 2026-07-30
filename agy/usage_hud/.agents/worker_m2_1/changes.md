# Modification Report — Milestone M2 Documentation

## Executed Modifications

### 1. Created User Manual (`USER_GUIDE.md`)
- **File Location**: `/home/ivan/project/script-docs/agy/usage_hud/USER_GUIDE.md`
- **Language**: Traditional Chinese (繁體中文)
- **Structure & Content**:
  - **Chapter 1: 系統簡介 (System Overview & Features)**: Detailed AGY Pure-ASCII statusline interceptor purpose, 100% pure ASCII constraint (`ord < 128`), zero-daemon architecture, dual-window quota monitoring (5h & Weekly), 3-tier ANSI alert colors, model truncation, and fallback defense.
  - **Chapter 2: 前置需求 (Prerequisites)**: Listed OS (Linux/POSIX/WSL), Python 3.6+ (std-lib only, no third-party dependencies), agy CLI compatibility, and ANSI terminal color support requirements (`TERM=xterm-256color`).
  - **Chapter 3: 一鍵部署 (One-Click Deployment)**: Step-by-step automatic deployment via `./setup.sh` and manual setup via `chmod +x statusline_hud.py`.
  - **Chapter 4: TUI 動態套用與 settings.json 持久化設定 (Configuration Guide)**: Dynamic session application via `/statusline /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py` and persistent configuration in `~/.gemini/antigravity-cli/settings.json` specifying exact absolute path `"command": "/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py"`.
  - **Chapter 5: 狀態列輸出與色彩解讀 (Display Specification)**: Detailed output layout breakdown, progress bar notation (`[===.....]`), duration formatting (`0m`, `Xm`, `XhYYm`, `XdYYh`), model name truncation (20 chars max), 3-tier ANSI color mapping (<70% Green `\033[1;32m`, 70-90% Yellow `\033[1;33m`, >=90% Red `\033[1;31m`), and fallback output schema (`5h: [........] --% | Wk: [........] --%`).
  - **Chapter 6: 一鍵驗證步驟 (Verification Steps)**: Unit test execution (`python3 test_statusline.py`), pipe simulation commands (`echo ... | python3 statusline_hud.py`), pure ASCII compliance verification (`LC_ALL=C grep -P "[\x80-\xFF]"`), and `settings.json` format verification snippet.

### 2. Created Troubleshooting Manual (`TROUBLESHOOTING.md`)
- **File Location**: `/home/ivan/project/script-docs/agy/usage_hud/TROUBLESHOOTING.md`
- **Language**: Traditional Chinese (繁體中文)
- **Structure & Content**:
  - **Chapter 1: 快速診斷樹 (Quick Diagnostic Flowchart)**: ASCII text flowchart categorizing 4 main symptom branches (statusline not visible, ANSI escape codes garbled, statusline stuck on `--%` fallback, overlong model names) leading to specific diagnosis steps.
  - **Chapter 2: 常見 7 大問題排查矩陣 (Troubleshooting Matrix)**: 7-row diagnostic matrix covering:
    1. Permission denied / missing executable bit -> `chmod +x`
    2. `settings.json` path issue -> use absolute path `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`
    3. JSON key schema mismatch (`statusline` vs `statusLine`) -> fix camelCase key
    4. ANSI color code rendering/terminal garbling -> `export TERM=xterm-256color`
    5. Stdin EOF / fallback output (`--%`) -> debug payload capture
    6. Negative reset seconds -> internal clamping to `0m`
    7. Overlong model name wrapping -> internal truncation to 20 chars
  - **Chapter 3: Raw JSON 載荷抓取與除錯工具指令 (Raw Payload Debugging)**: Interceptor script `debug_interceptor.sh` (`cat - | tee /tmp/... | python3 statusline_hud.py`), payload inspection via `json.tool`, and replay testing commands.
  - **Chapter 4: 單元測試與迴歸維護 (Unit Testing & Regression Maintenance)**: Running `python3 test_statusline.py` across Tiers 1-4 (18 boundary tests), regression guidelines, and procedure for adding custom test cases (e.g. `TC-19`).

## Verification Summary
- Both `USER_GUIDE.md` and `TROUBLESHOOTING.md` were written exclusively in Traditional Chinese (繁體中文).
- Technical details accurately reflect the logic in `statusline_hud.py`, `test_statusline.py`, `setup.sh`, and `PROJECT.md`.
- No hardcoded test results or facade implementations were used.
