# Version Skill

給 **Claude Code** 用的版號與發布 skill。一份規則服務所有 repo —— 規則寫在 skill 裡，路徑寫在各專案的 `.claude/version.config.json` 裡。

```text
你：把這版發出去
Claude：讀 .claude/version.config.json → 決定版號 → 同步版號檔 → 定稿 CHANGELOG
        → commit / push → 從 CHANGELOG 抽出該版段落 → gh release create
```

skill 全文見 [SKILL.md](./SKILL.md)。

---

## 特點

- **規則與路徑分離**：skill 不猜檔名。找不到 `.claude/version.config.json` 就走 Bootstrap，偵測後提出設定草案請你核准，核准前不寫入任何檔案。
- **版號規則明確**：發布分支 `x.y.z`，開發分支 `x.y.z-dev.N`。dev 版號裡的 `x.y.z` 是**下一個**正式版，不是目前這個。
- **三個位置各有判準**：`x` 破壞相容性、`y` 新增功能、`z` 修錯與文件；進位時右側全部歸零。`x` 還是 `0` 時規則左移一位——破壞性變更只加 `y`，且是否進 `1.0.0` 一律由你決定，skill 不自行判斷。
- **發布後兩個分支同號**：發布步驟固定以 `git push origin <releaseBranch>:<devBranch>` 收尾，不留下版號分歧。
- **CHANGELOG 是唯一真相**：GitHub Release 只是鏡像，內文一律從 CHANGELOG 抽出，不另外手寫。
- **抽段落不會抓錯版**：用 `re.escape`，`0.9.2` 不會命中 `0.9.20`；遇到下一個版本標題就停，不會把舊版內容一起送出。
- **可以修已發布的 Release**：`gh release create` 遇到既有 Release 會失敗，skill 明確指向 `gh release edit --notes-file` 覆寫內文。
- **支援沒有版號檔的 repo**：`syncFiles` 設為 `[]` 時，以 git tag 作為唯一版號載體。
- **可整包關閉 gh**：`release.enabled` 設為 `false` 就只做版號與 CHANGELOG，不碰 GitHub。

---

## 需求

- [Claude Code](https://claude.com/claude-code)
- `git`
- [`gh`](https://cli.github.com/)（GitHub CLI，已 `gh auth login`）—— 只有要發 Release 時需要
- `python3` 3.6+（僅標準庫）—— 抽 CHANGELOG 段落用

---

## 安裝

### 方式一：一行指令

下載 `SKILL.md` 到 Claude Code 的全域 skill 目錄：

```bash
mkdir -p ~/.claude/skills/version \
  && curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/skill/versioning/SKILL.md \
       -o ~/.claude/skills/version/SKILL.md
```

### 方式二：clone 後建立符號連結（推薦）

`git pull` 就等於更新，不必重下載：

```bash
git clone https://github.com/CTJ425/script-docs.git
ln -sfn "$(pwd)/script-docs/AI/skill/versioning" ~/.claude/skills/version
```

> [!IMPORTANT]
> 目錄名稱必須是 `version`，要與 `SKILL.md` 內 frontmatter 的 `name: version` 一致。
> 原始資料夾叫 `versioning`，所以 `ln -s` 的目標名稱要明確寫成 `version`。

### 只裝在單一專案

把上面的 `~/.claude/skills/` 換成該專案的 `<repo>/.claude/skills/`。專案層級的 skill 只在該 repo 內出現。

### 確認安裝成功

```bash
ls -l ~/.claude/skills/version              # 連結存在且指向正確
head -3 ~/.claude/skills/version/SKILL.md   # 應顯示 name: version
```

在 Claude Code 內執行 `/skills`，清單中應出現 `version`。

---

## 更新

| 安裝方式 | 更新指令 |
| --- | --- |
| 符號連結 | `git -C <clone 路徑> pull` |
| 一行指令 | 重跑一次安裝指令，`-o` 會直接覆寫 |

skill 內容在每次對話載入時讀取，更新後開新的 Claude Code 對話即生效，不需重啟終端機。

### 解除安裝

```bash
rm ~/.claude/skills/version        # 符號連結
rm -r ~/.claude/skills/version     # 一行指令安裝（實體目錄）
```

---

## 設定檔

放在**目標專案**的 repo 根目錄：`.claude/version.config.json`。

```json
{
  "tagPrefix": "v",
  "releaseBranch": "main",
  "devBranch": "dev",
  "changelog": "CHANGELOG.md",
  "appDir": ".",
  "syncFiles": [
    { "path": "package.json", "type": "json", "key": "version" },
    { "path": "src/version.ts", "type": "regex", "pattern": "APP_VERSION = '<version>'" }
  ],
  "release": { "enabled": true, "draft": false, "latest": true }
}
```

| 欄位 | 說明 |
| --- | --- |
| `tagPrefix` | git tag 的前綴。`""` 表示 `1.2.3`，`"v"` 表示 `v1.2.3` |
| `releaseBranch` | 帶正式版號的分支 |
| `devBranch` | 帶 `-dev.N` 的分支。單分支專案填 `null` |
| `changelog` | 版本紀錄檔路徑。這個檔案是唯一真相 |
| `appDir` | 執行 `npm` 的目錄 |
| `syncFiles` | 所有顯示版號的檔案。`regex` 型態用 `<version>` 標出版號位置；沒有這種檔案時填 `[]` |
| `release.enabled` | 設為 `false` 可完全跳過 `gh` 步驟 |

沒有這個檔案時，skill 會偵測版號檔、CHANGELOG、分支與 tag 樣式，提出草案請你核准後才寫入。

### 本 repo 的實際設定

本 repo 沒有任何檔案寫著版號，版號只存在於 git tag，因此 `syncFiles` 是 `[]`、`tagPrefix` 是 `v`、`devBranch` 是 `null`。內容見 [`.claude/version.config.json`](../../../.claude/version.config.json)。

---

## 使用

skill 由描述自動觸發，直接用自然語言講即可：

| 你說 | skill 做的事 |
| --- | --- |
| 「把版號往上帶」 | 讀目前版號 → 算出 `x.y.z-dev.N` → 寫進所有 `syncFiles` → 補 CHANGELOG → 用 `grep` 確認舊版號已消失 |
| 「發布 1.2.0」 | 拿掉 `-dev.N` → 定稿 CHANGELOG → 合併推送 → 同步兩個分支 → 建立 GitHub Release |
| 「Release 內文寫錯了」 | 重抽 CHANGELOG 段落 → `gh release edit --notes-file` 覆寫 |

也可以在 Claude Code 內直接叫用：

```text
/version 發布 1.2.0
```

### 抽 CHANGELOG 段落

發 Release 前，skill 用 `python3` 從 CHANGELOG 抽出單一版本段落。此處不能用 `awk`：skill 檔案在送進 shell 前會展開 shell 位置參數，而 awk 的整行欄位參照正是位置參數，載入時會被替換成 skill 的參數文字，比對隨即失敗。完整程式碼見 [SKILL.md](./SKILL.md) 的 § GitHub Release。

> [!WARNING]
> **Release 內文沒有 secret scanning 閘門。** 公開 repo 會在 `git push` 擋下憑證，但 Release 內文一建立就是公開的。只貼已經進版控的 CHANGELOG 段落，不要貼 log、cron 指令或函式輸出。

---

## 驗證

```bash
# 1. 安裝正確（連結指向、frontmatter 名稱）
ls -l ~/.claude/skills/version
grep -m1 '^name:' ~/.claude/skills/version/SKILL.md   # 應為 name: version

# 2. skill 內沒有會被參數展開吃掉的 $0 / $1
grep -nE '\$[0-9]' ~/.claude/skills/version/SKILL.md  # 應無輸出

# 3. 設定檔可解析
python3 -c "import json;print(json.load(open('.claude/version.config.json')))"

# 4. CHANGELOG 抽段落（在有設定檔的 repo 內執行）
VERSION=1.2.0
python3 - CHANGELOG.md "$VERSION" <<'PY'
import re, sys
path, ver = sys.argv[1], sys.argv[2]
head = re.compile(r'^#+ +\[?' + re.escape(ver) + r'\]?([^0-9.]|$)')
nxt  = re.compile(r'^#+ +\[?[0-9]+\.')
out, on = [], False
for line in open(path, encoding='utf-8'):
    if on and nxt.match(line):
        break
    if on:
        out.append(line)
    elif head.match(line):
        on = True
print(re.sub(r'\n*-{3,}\s*$', '', ''.join(out).strip()).strip())
PY

# 5. Release 與 tag 一致
gh release list --limit 5
git tag --sort=-v:refname | head -5
```

第 4 步應只印出該版段落，且不含下一版標題。輸出為空表示 CHANGELOG 標題格式不符 —— 標題必須是 `## <版號>`，不帶 `tagPrefix`。

---

## 檔案

| 檔案 | 用途 |
| --- | --- |
| [SKILL.md](./SKILL.md) | skill 本體：版號規則、設定契約、發布流程、`gh` 指令、Bootstrap |
| [README.md](./README.md) | 本頁：安裝、更新、設定與驗證 |

---

## 為什麼不做成每個專案自己一份

版號規則在所有 repo 都一樣，會變的只有檔案路徑。把兩者混在一起寫，換一個 repo 就得整份重抄，而抄過去的路徑會過期。這裡把會變的部分收斂成一個 JSON，skill 本身完全不含專案知識 —— 也因此 skill 明確禁止用 glob 去猜 `version.ts` 在哪。猜錯路徑的 skill 比沒有 skill 更糟。
