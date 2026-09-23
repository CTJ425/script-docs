# Global CLAUDE.md

> 最後更新：2026-09-23

給 **Claude Code** 用的全域指令檔（`~/.claude/CLAUDE.md`），套用在所有專案。針對 Claude Code 2.1.280 與 Claude Opus 5.5 撰寫。

## 內容

| 區塊 | 規範 |
| --- | --- |
| Language | 一律用繁體中文（zh-TW）回覆；程式碼、指令、錯誤訊息保留原文；所有 CLAUDE.md、rules 與記憶檔一律用英文撰寫 |
| How to think | 寫程式與排錯遵循**第一性原理**：從系統的實際事實出發、先驗證假設；排錯依「重現 → 假設 → 驗證 → 修根因」進行 |
| How to communicate | 回報遵循**金字塔原理**：先講結論，再列不重疊的理由，最後附證據；排錯報告依「根因 → 修法 → 證據 → 尚未驗證處」排列 |
| Working style | 直白陳述、驗證後才說完成、長任務前後各一行預告與總結、不擅自擴大範圍、點名前端要避開的預設風格 |

## 設計取捨

依照 Claude Code 官方記憶檔文件與 Opus 5.5 遷移指南撰寫：

- **控制在 200 行以內**：檔案越長，模型越不會照著做。
- **不濫用 `IMPORTANT` / `MUST`**：強調字只留給模型一再忽略的單一規則，全部都強調就等於沒有強調。
- **不寫 `think step by step` 或「不要想太多」**：Opus 5.5 的思考一律開啟，深度改用 `/effort` 調整，不靠提示詞控制。
- **格式規則用正面描述**：寫明何時用列表或表格，不寫「不要用 bullet」這類禁令。
- **前端風格點名具體樣式**：Opus 5.5 對「不要用米白底、01/02/03 編號」這類具體清單反應較好，只寫「不要 AI 感」效果有限。

## 安裝

```bash
[ -f ~/.claude/CLAUDE.md ] && cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.bak
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/md/CLAUDE.md -o ~/.claude/CLAUDE.md
```

重開 Claude Code 後生效，可用 `/memory` 確認已載入。

第一行的 `@RTK.md` 會匯入 `rtk` 產生的 `~/.claude/RTK.md`。沒有使用 rtk 的話，刪掉這一行即可。

## 解除安裝

```bash
mv ~/.claude/CLAUDE.md.bak ~/.claude/CLAUDE.md   # 還原備份
# 或直接刪除：rm ~/.claude/CLAUDE.md
```
