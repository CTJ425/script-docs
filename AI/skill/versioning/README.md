# Versioning Skill

給 **Claude Code** 用的版號與 Release skill。規則寫在 skill 裡，路徑寫在專案的 `.claude/release.config.json` 裡。

```text
你：把這版發出去
Claude：讀 .claude/release.config.json → 決定版號 → 同步所有版號檔 → 定稿 CHANGELOG
        → commit / push → 從 CHANGELOG 抽出該版段落 → gh release create
```

skill 全文見 [SKILL.md](./SKILL.md)。安裝與設定檔說明見 [上一層 README](../README.md)。發布管線（測試閘門、部署、停下來問你）由 [`ship`](../ship) 負責，它在需要版號時呼叫本 skill。

---

## 特點

- **規則與路徑分離**：skill 不猜檔名。找不到設定檔就走 Bootstrap，偵測後提出草案請你核准，核准前不寫入任何檔案。
- **版號規則明確**：發布分支 `x.y.z`，開發分支 `x.y.z-dev.N`。dev 版號裡的 `x.y.z` 是**下一個**正式版，不是目前這個。
- **三個位置各有判準**：`x` 破壞相容性、`y` 新增功能、`z` 修錯與文件；進位時右側全部歸零。`x` 還是 `0` 時規則左移一位 —— 破壞性變更只加 `y`，且是否進 `1.0.0` 一律由你決定。
- **lockfile 不會半舊半新**：`package.json` 用 `type: "npm"`，由 `npm version --no-git-tag-version` 同時更新 `package.json` 與 `package-lock.json`。手改 JSON 鍵會漏掉 lockfile 裡的 `packages[""].version`，之後 `npm ci` 裝出來的版號就和 app 顯示的不一致。
- **發布後兩個分支同號**：發布步驟固定以 `git push origin <releaseBranch>:<devBranch>` 收尾。
- **CHANGELOG 是唯一真相**：Release 只是鏡像，內文一律從 CHANGELOG 抽出，不另外手寫。
- **抽段落不會抓錯版**：用 `re.escape`，`0.9.2` 不會命中 `0.9.20`；遇到下一個版本標題就停。輸出檔用 `mktemp`，兩個 repo 同時發布不會互相蓋掉。
- **可以修已發布的 Release**：`gh release create` 遇到既有 Release 會失敗，skill 明確指向 `gh release edit --notes-file` 覆寫內文。
- **支援沒有版號檔的 repo**：`syncFiles` 設為 `[]` 時，以 git tag 作為唯一版號載體。
- **不跟 CI 搶著發 Release**：`release.publishedBy` 設 `"ci"` 時，Release 由 workflow 在 push 時建立，skill 只負責確認內文與必要時修補。
- **可整包關閉 gh**：`release.enabled` 設為 `false` 就只做版號與 CHANGELOG。

---

## 需求

- [Claude Code](https://claude.com/claude-code)
- `git`
- [`gh`](https://cli.github.com/)（已 `gh auth login`）—— 只有要發 Release 時需要
- `python3` 3.6+（僅標準庫）—— 抽 CHANGELOG 段落用

---

## 使用

skill 由描述自動觸發，直接用自然語言講即可：

| 你說 | skill 做的事 |
| --- | --- |
| 「把版號往上帶」 | 讀目前版號 → 算出 `x.y.z-dev.N` → 依 `type` 寫進所有 `syncFiles` → 補 CHANGELOG → `grep` 確認舊版號已消失 |
| 「發布 1.2.0」 | 拿掉 `-dev.N` → 定稿 CHANGELOG → 合併推送 → 同步兩個分支 → 建立 GitHub Release |
| 「Release 內文寫錯了」 | 重抽 CHANGELOG 段落 → `gh release edit --notes-file` 覆寫 |

也可以直接叫用：`/versioning 發布 1.2.0`。

### 本 repo 的實際設定

本 repo 沒有任何檔案寫著版號，版號只存在於 git tag，因此 `syncFiles` 是 `[]`、`tagPrefix` 是 `v`、`devBranch` 是 `null`。內容見 [`.claude/release.config.json`](../../../.claude/release.config.json)。

### 抽 CHANGELOG 段落

發 Release 前，skill 用 `python3` 從 CHANGELOG 抽出單一版本段落。**此處不能用 `awk`**：skill 檔案在送進 shell 前會展開 shell 位置參數，而 awk 的整行欄位參照正是位置參數，載入時會被替換成 skill 的參數文字，比對隨即失敗。完整程式碼見 [SKILL.md](./SKILL.md) 的 § GitHub Release。

> [!WARNING]
> **Release 內文沒有 secret scanning 閘門。** 公開 repo 會在 `git push` 擋下憑證，但 Release 內文一建立就是公開的。只貼已經進版控的 CHANGELOG 段落，不要貼 log、cron 指令或函式輸出。

---

## 驗證

```bash
# 1. 安裝正確（frontmatter 名稱要等於資料夾名稱）
grep -m1 '^name:' ~/.claude/skills/versioning/SKILL.md   # 應為 name: versioning

# 2. skill 內沒有會被參數展開吃掉的 $0 / $1
grep -nE '\$[0-9]' ~/.claude/skills/versioning/SKILL.md   # 應無輸出

# 3. 設定檔可解析
python3 -c "import json;print(json.load(open('.claude/release.config.json'))['repo'])"

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
| [README.md](./README.md) | 本頁 |
