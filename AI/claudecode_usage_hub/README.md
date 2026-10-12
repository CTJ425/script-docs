# Claude Code Usage HUD

> 最後更新：2026-10-12

一個 Claude Code plugin：在輸入框正下方、和模式標籤（mode pill）同一行，用一行文字顯示模型與 reasoning effort、5 小時用量與重置倒數、每週用量，以及目前 session 的 context window 用量。

```
⏵⏵ auto mode on · Opus 5.5 · high   5h 45% · 2h10m   Wk 23%   Ctx 156K/1M
```

它是一個 *mod*：由 function hook 組成、在 Claude Code 內部執行的 plugin。

- **佔用哪一行**：閒置時它取代 Claude Code 的提示文字（`(shift+tab to cycle)`、`? for shortcuts`）。回合進行中，提示文字（`esc to interrupt`）保留在那一行，HUD 移到下一行；閒置時只要提示文字帶有自己的狀態（背景 agent 執行中的 `↓ to manage`、PR 狀態），HUD 也一樣移到下一行。
- **為什麼不在別的位置**：模式標籤由 Claude Code 自己畫在所有 plugin 之前，所以標籤和輸入框之間插不進任何一行。它也不用 plugin 狀態列，因為 Claude Code 會把狀態列顯示成前綴 `⚠ usage-hud:` 的通知。
- **每段都有標籤**：`5h` 是 5 小時視窗，`Wk` 是每週，`Ctx` 是 context window。終端機裡標籤維持純文字，任何字型和多工器（multiplexer）都畫成一格寬；Claude Desktop 則改畫小型向量圖示，也可以選擇和終端機一樣用文字（見[選項](#選項)）。
- **顏色分出「是什麼」和「多少」**：標籤與分隔符是暗色，數值用主題的強調色；視窗用量到 90% 以上時改用錯誤色，並加上 `!` 標記（`5h 93%!`）。

補充：

- **Effort** 取自 session 的模型請求。第一個請求之前，先用設定檔裡該模型的 `effortLevel`（`modelSettings.<model>`，沒有就用最上層的）代替；沒有 effort 設定的模型就不顯示。
- 還沒有數字的視窗顯示 `–`。
- **其他 mod 可以接在同一行後面。** 一個 hook 同一行（`PromptHint` 上的 `ui.render`）的 mod，把自己的文字放進 `tail` prop，例如 `next({ ...e, props: { ...e.props, tail } })`，這段文字就會以暗色畫在 HUD 的最後、`Ctx` 之後空三格的位置，終端機和 Claude Desktop 都一樣：
  ```
  ⏵⏵ auto mode on · Opus 5.5 · high   5h 45% · 2h10m   Wk 23%   Ctx 156K/1M   agents 1 0:12
  ```
  多個 mod 要共用時，請接在 `e.props.tail` 後面，不要整個取代它。這一行只有一行，終端機太窄時尾端會被截掉。

## 需求

- 支援 plugin function hook（`hooks/hooks.json` → `modules`）的 Claude Code。這套 API 還在 early access，版本之間可能會變動。
- 以 Claude.ai Pro / Max 帳號登入（用 API key 的帳號沒有 rate limit 用量，會顯示 `–`）。

## 安裝

1. 加入 marketplace。從 GitHub：
   ```bash
   claude plugin marketplace add CTJ425/script-docs
   ```
   或從本機 clone 加入，裝到的就是目前 checkout 的內容（包含還沒 push 的 commit）：
   ```bash
   git clone https://github.com/CTJ425/script-docs.git
   claude plugin marketplace add ./script-docs
   ```
   兩種方式註冊的 marketplace 名稱都是 `script-docs`，只要選一種。
2. 安裝 plugin：
   ```bash
   claude plugin install usage-hud@script-docs
   ```
3. 確認已安裝並啟用：
   ```bash
   claude plugin list
   ```
   `usage-hud@script-docs` 應顯示 `Status: ✔ enabled`。
4. 重開 Claude Code。輸入框下方會出現這一行；用量數字在第一次回覆後填上（如果其他 session 已經有數字，會直接從 store 讀出來）。

### 選項

| 選項 | 值 | 預設 |
| --- | --- | --- |
| `desktopLabels` | `icons`：Claude Desktop 用圖示標示各段。`text`：顯示 `5h` / `Wk` / `Ctx` 文字，和終端機同一行內容。 | `icons` |

不論選哪個，終端機一律顯示文字。可以在 `claude plugin install` 出現的選項畫面設定，之後也能在終端機 session 的 `/config`（*Desktop labels* 那一列）修改。設定存在使用者設定檔裡，Desktop 的 Code 分頁也會讀它。已經開著的 session 沒有切換的話，重開它。

### 更新

```bash
claude plugin marketplace update script-docs
claude plugin update usage-hud@script-docs
```

更新後重開 Claude Code。

### 從 statusline 腳本版（1.x）升級

舊版是 `statusLine` 指令。請把 `~/.claude/settings.json` 裡的 `statusLine` 鍵刪掉，並刪除 `~/.claude/usage_hub/`，否則兩行會同時出現。

## 數字怎麼保持最新

- Claude Code 在每個回合結束後，以及 rate limit 視窗每變動一個整數百分點時，會推送 `session.measure` 事件；其餘的（倒數、其他 session 寫入的用量、等待 subagent 時的用量）由每 5 秒一次的計時器補上。
- Claude Code 在 session 收到第一個 API 回應之前不會回報 rate limit，所以最後一次已知的數值會存在 plugin 的 store 裡，先拿來顯示，新 session 一打開就有真實數字，而不是 `–`。store 裡的視窗如果重置時間已經過了，顯示 `0%`；超過 7 天的數值會被忽略。
- store 由你所有的 session 共用。閒置的 session 只知道自己上一次 API 回應時的用量，所以它會改顯示活躍 session 存下的數字，而且絕不覆寫它。session 自己拿到的新數字永遠優先，即使在同一個視窗內比較低也一樣。

## 解除安裝

```bash
claude plugin uninstall usage-hud@script-docs
```

要清得一乾二淨，再移除 marketplace、存下來的用量，以及快取的各版本（`uninstall` 會保留裝過的每一個版本）：

```bash
claude plugin marketplace remove script-docs
rm -f ~/.claude/plugins/store/usage-hud_script-docs-*.json
rm -rf ~/.claude/plugins/cache/script-docs/usage-hud
```

## 開發

只在這一個 session 載入這個資料夾（存檔時會 hot reload）：

```bash
claude --plugin-dir ./AI/claudecode_usage_hub
```

檢查與測試：

```bash
claude plugin validate AI/claudecode_usage_hub
claude plugin test AI/claudecode_usage_hub
```
