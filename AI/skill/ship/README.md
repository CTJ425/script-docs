# Ship Skill

給 **Claude Code** 用的發布管線 skill。**它管順序與煞車，不管指令** —— 指令寫在專案的 `.claude/release.config.json` 裡。

```text
你：ship
Claude：跑測試閘門 → 交給 versioning 帶版號 → commit / push dev
        → 部署（交給專案的部署 skill）→ 驗證 → 定稿 CHANGELOG
        → 停下來報告，等你授權 → 合併發布 → 正式環境另外部署 → 更新紀錄
```

skill 全文見 [SKILL.md](./SKILL.md)。安裝與設定檔說明見 [上一層 README](../README.md)。版號的部分由 [`versioning`](../versioning) 負責，ship 在第 3 步與第 9 步呼叫它。

---

## 十二個步驟

| # | 步驟 | 停在哪 |
| --- | --- | --- |
| 1 | 跑 `gates`，逐條照 `cmd` 原字串執行 | 任何一條失敗就停，回報失敗輸出，其他什麼都不動 |
| 2 | 沒東西可發就說沒東西 | 不會為了有事做而硬帶版號 |
| 3 | 交給 `versioning` 帶版號 + 寫 CHANGELOG（用 `changelogLang`） | |
| 4 | commit、push **`devBranch`** | 這一步絕不 push 發布分支 |
| 5 | 部署（`deploy.hookSkill` 優先於 `deploy.cmd`） | 兩者都沒有就停下來問你 |
| 6 | 驗證**部署後的結果**，不是 build 輸出 | 驗不到就說驗不到並說原因 |
| 7 | **在推發布分支之前**定稿 CHANGELOG | |
| 8 | **停下來，報告全貌，等你授權** | `flow.askBeforeRelease` 只有你能關 |
| 9 | 交給 `versioning` 拿掉 `-dev.N`、合併、同步分支、發 Release | |
| 10 | 提醒：推發布分支**不會**部署任何服務 | 正式環境要另外部署並驗證 |
| 11 | 更新專案的追蹤文件（`record.hookSkill`） | |
| 12 | 用 `changelogLang` 寫一段簡短總結 | 含還沒驗證到的部分 |

---

## 三條硬規則

這三條是這個 skill 真正的價值，其餘都是編排。

**閘門指令照抄，不准換等價的。** 專案把某條指令放進 `gates`，通常是因為更窄的那條已經放過一次錯。最常見的例子：`npm run build` 不能換成 `npx tsc --noEmit` —— 後者不檢查測試檔，於是 typecheck 回報 exit 0 而 build 是紅的。

**絕不自己生一條部署指令。** 不猜 CLI、不猜 project ref、不猜環境名、不猜旗標。部署到錯的地方，不是改個檔案就能救回來的。所以部署只能來自 `deploy.hookSkill` 指名的專案 skill、或 config 明寫的 `deploy.cmd`。

**第 8 步一定停。** 那是整條管線唯一一個人類看得到全貌、而東西還沒公開的位置。不會因為「看起來沒問題」就自己往下走。

---

## 為什麼 CHANGELOG 要在推發布分支之前定稿

Release 內文是在 push 當下從 CHANGELOG 段落生成的，而建立 Release 的自動化**遇到已存在的 Release 會跳過**。所以推上去的那一刻還寫著「pending」「尚未部署」的段落，就成為永久的公開 Release 內文，之後只能用 `gh release edit` 手動改。這件事真的發生過一次。

---

## 需求

- [Claude Code](https://claude.com/claude-code)，並已安裝 [`versioning`](../versioning) skill
- `git`
- 專案自己的測試 / build 指令，以及（若有部署）一個負責部署的專案 skill

---

## 適用範圍

| 專案型態 | 設定方式 |
| --- | --- |
| dev / main 雙分支 + 後端部署 | 完整十二步 |
| 單分支 | `devBranch` 設 `null` 或 `flow.devFirst` 設 `false`；第 4–7 步併成一次 push，第 8 步照樣停 |
| 純前端、無部署 | 不要有 `deploy` 鍵，該步安靜跳過 |
| 不需要 GitHub Release | `version.release.enabled` 設 `false` |

---

## 檔案

| 檔案 | 用途 |
| --- | --- |
| [SKILL.md](./SKILL.md) | skill 本體：設定契約、十二個步驟、單分支模式、Bootstrap |
| [README.md](./README.md) | 本頁 |
