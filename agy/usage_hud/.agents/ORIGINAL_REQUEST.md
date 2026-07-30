# Original User Request

## 2026-07-30T14:24:16Z

<USER_REQUEST>
對 AGY Pure-ASCII Usage Statusline 進行深度的多情境自動化驗證、邊界條件修復，並撰寫完整的繁體中文技術架構與使用者操作手冊。

Working directory: /home/ivan/project/script-docs/agy/usage_hud
Integrity mode: development

## Requirements

### R1. 自動化驗證與極限邊界測試 (Verification)
建立擴充版測試套件，覆蓋極限邊界情境（例如超長 AI 模型名稱自動截斷、負數與異常重置時間處理、無效或損毀 JSON 載荷容錯、純 ASCII 色彩剝離驗證）。

### R2. 邊界缺陷修復與穩健性強化 (Robustness & Fixes)
確保狀態列腳本 statusline_hud.py 在任何極端情況下皆保持 100% 安定，無 Crash、無 Non-ASCII 字元溢出。

### R3. 使用者手冊與疑難排解文件 (Documentation)
撰寫高品質繁體中文操作與維護手冊，包含：
- USER_GUIDE.md: 安裝、設定檔 settings.json 整合說明、TUI 開關教學。
- TROUBLESHOOTING.md: 常見問題與除錯手冊（如無顯示狀態列、權限問題等）。

## Acceptance Criteria

### 驗證與測試 (Verification)
- [ ] 所有擴充邊界單元測試 100% 自動化通過
- [ ] 狀態列輸出 100% 保持純 ASCII 標準（無任何非 ASCII Unicode 字元）
- [ ] 能優雅處理負數重置時間與超長模型名稱

### 手冊與文件 (Documentation)
- [ ] 完成完整繁體中文 USER_GUIDE.md 與 TROUBLESHOOTING.md
- [ ] 提供 settings.json 設定範例與一鍵驗證步驟
</USER_REQUEST>
