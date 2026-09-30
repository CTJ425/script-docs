# Claude Code Release Skills

給 [Claude Code](https://claude.com/claude-code) 用的發布流程 skill。**規則寫在 skill 裡，路徑與指令寫在各專案的 `.claude/release.config.json` 裡** —— 一份規則服務所有 repo，換 repo 只換那個 JSON。

| Skill | 負責 | 說明 |
| --- | --- | --- |
| [`versioning`](./versioning) | 版號、CHANGELOG、GitHub Release | 決定下一個版號、同步所有寫著版號的檔案、從 CHANGELOG 抽段落發 Release |
| [`ship`](./ship) | 發布管線的順序與煞車 | 測試閘門 → 版號 → 推 dev → 部署 → 驗證 → **停下來問你** → 發布 |

兩者共用同一個設定檔：`ship` 走到第 3 步與第 9 步時把版號的事交給 `versioning`。

---

## 安裝

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/skill/install.sh | bash -s -- --global
```

裝到全域（`~/.claude/skills`，這台機器上每個 repo 都看得到）。只裝在目前這個 repo：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/skill/install.sh | bash -s -- --project
```

不加旗標時會互動詢問 global 還是 project。

> [!IMPORTANT]
> `curl … | bash` 的 stdin 是 pipe，不是鍵盤。installer 因此改從 `/dev/tty` 讀你的選擇；在完全沒有終端機的環境（CI、背景工作）它**不會猜**，而是直接失敗並印出兩種旗標寫法。要非互動安裝就一定要帶 `--global` 或 `--project`。

### 選項

| 旗標 | 作用 |
| --- | --- |
| `--global` | 裝到 `${CLAUDE_CONFIG_DIR:-~/.claude}/skills` |
| `--project[=PATH]` | 裝到 `<repo>/.claude/skills`。`PATH` 省略時用目前 git repo 的根目錄 |
| `SKILL...` | 只裝指定的 skill（如 `versioning`）。不給就全裝 |
| `--dry-run` | 印出會做什麼，不寫任何檔案 |
| `--list` | 列出 manifest 裡有哪些 skill |
| `--force` | 覆寫時不留 `.bak` |
| `--help` | 說明 |

環境變數：`SKILL_RAW_BASE`（改下載來源，給 fork 用）、`SKILL_RAW_BRANCH`（預設 `main`）、`CLAUDE_CONFIG_DIR`。

### 覆寫規則

內容相同就跳過；不同就先把舊檔複製成 `<file>.bak` 再寫入，並印出備份路徑。`--force` 才會直接覆蓋不留備份 —— 預設永遠不會弄丟你改過的內容。

### 從 clone 安裝

腳本偵測到自己旁邊有 `manifest.json` 時就走本機檔案，不連網：

```bash
git clone https://github.com/CTJ425/script-docs.git
./script-docs/AI/skill/install.sh --global
```

更新就是 `git -C script-docs pull` 後再跑一次。用 `curl` 裝的話重跑安裝指令即可。

### 確認與移除

```bash
ls ~/.claude/skills/versioning ~/.claude/skills/ship
grep -m1 '^name:' ~/.claude/skills/ship/SKILL.md      # 應為 name: ship
rm -r ~/.claude/skills/versioning ~/.claude/skills/ship
```

在 Claude Code 內執行 `/skills`，清單應出現 `versioning` 與 `ship`。skill 在每次對話載入時讀取，更新後開新對話即生效。

---

## 設定檔

放在**目標專案**的 repo 根目錄：`.claude/release.config.json`。三節，每個鍵只有一個擁有者。

```json
{
  "repo": {
    "tagPrefix": "",
    "releaseBranch": "main",
    "devBranch": "dev",
    "changelog": "docs/CHANGELOG.md",
    "changelogLang": "zh-TW",
    "appDir": "."
  },
  "version": {
    "syncFiles": [
      { "path": "package.json", "type": "npm" },
      { "path": "src/version.ts", "type": "regex", "pattern": "APP_VERSION = '<version>'" }
    ],
    "release": { "enabled": true, "publishedBy": "skill", "draft": false, "latest": true }
  },
  "ship": {
    "gates": [
      { "name": "test",  "cmd": "npm test" },
      { "name": "build", "cmd": "npm run build" }
    ],
    "flow": { "devFirst": true, "askBeforeRelease": true },
    "deploy": { "hookSkill": "supabase-ops", "triggerPaths": ["supabase/**"] },
    "verify": { "hookSkill": "verify" },
    "record": { "hookSkill": "bookkeeping" }
  }
}
```

- `repo` 兩個 skill 都讀，所以分支名、`appDir`、CHANGELOG 路徑只存在一份，不會兩邊不一致。
- 所有 `path` 都是**相對 repo 根目錄**，`appDir` 只決定指令在哪裡執行。
- `version.release.publishedBy` 設 `"ci"` 時，Release 由 workflow 在 push 時建立，skill 只確認與修補內文，不會去跟 workflow 搶著建立。
- 缺席的區塊會**安靜跳過**：沒有部署步驟的 repo 就不要有 `deploy` 鍵。
- 沒有這個檔案時，skill 會偵測現況、提出草案，**核准前不寫入任何檔案**。跟 Claude Code 說「幫這個 repo 設定發布設定檔」即可。

欄位逐項說明見各 skill 的 `SKILL.md`：[versioning](./versioning/SKILL.md#config-contract)、[ship](./ship/SKILL.md#config-contract)。

### 舊檔名

先前版本叫 `.claude/version.config.json`，且 `repo` 的鍵放在最上層、沒有 `ship` 節。skill 讀得懂它，並會提議改名。**不要同時留兩個檔。**

---

## 設計取捨

**為什麼部署交給另一個 skill，而不是寫在 config 裡。** 部署知識塞不進一行字串 —— 「DEV 是 cloud 不是本機 docker」、「這個函式在 cloud 要加 `--no-verify-jwt`」、「動手前先跑 `verify_setup()`」這些是段落。config 裡寫一條 `cmd` 只會讓人以為部署已經被涵蓋。所以 `deploy.hookSkill` 指名一個專案自己的 skill；真正簡單的專案才用 `deploy.cmd`；兩個都沒有時 ship 會停下來問，**絕不自己生一條部署指令**。

**為什麼不每個專案各寫一份。** 版號與發布的規則在所有 repo 都一樣，會變的只有路徑。混在一起寫，換 repo 就得整份重抄，而抄過去的路徑會過期。猜錯路徑的 skill 比沒有 skill 更糟 —— 所以 skill 明確禁止用 glob 去猜版號檔在哪。

---

## 檔案

| 檔案 | 用途 |
| --- | --- |
| [`install.sh`](./install.sh) | 安裝器 |
| [`manifest.json`](./manifest.json) | skill 清單與各自的檔案；CI 驗證它和實際資料夾一致 |
| [`versioning/`](./versioning) | 版號與 Release skill |
| [`ship/`](./ship) | 發布管線 skill |
