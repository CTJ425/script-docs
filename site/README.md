# 文件入口網站 (site/)

React + MUI 的文件網站，部署到 GitHub Pages：<https://ctj425.github.io/script-docs/>

## 核心原則：README 是唯一真相來源

網站不儲存任何文件內容。`scripts/sync-content.mjs` 會掃描 repo 內所有 `README.md`，
把**原始位元組**寫進 `src/content/manifest.json`，前端再以 `react-markdown` 渲染。

因此：

- 子頁內容與 `README.md` 永遠一致，不可能漂移（有測試逐一比對）
- 導覽、路由、搜尋全部由 manifest 驅動，**沒有任何硬編碼的專案清單**
- 新增子專案 = 建立資料夾 + 放入 `README.md` + push，網站自動出現新頁面

`src/content/manifest.json` 是產生物，不進版控（每次 dev/build 都會重新產生）。

## 指令

```bash
npm install

npm run dev        # 開發伺服器；改任何 README.md 會即時重新載入
npm run build      # 產生 dist/（build 前自動重新掃描 README）
npm run preview    # 以 /script-docs/ 子路徑預覽 dist/

npm run sync       # 只重新產生 manifest
npm run typecheck  # tsc --noEmit
npm run test       # 渲染每一頁並驗證錨點、程式碼區塊、連結、內容一致性
npm run verify     # typecheck + test + build（CI 跑的同一道關卡）
```

## 可選的每資料夾設定

預設值（標題取 `README.md` 第一個 `#` 標題、slug 取資料夾名）通常就夠用。
若要調整，在子資料夾放一個 `docs.json`：

```json
{
  "title": "自訂標題",
  "icon": "description",
  "order": 1,
  "tags": ["kubernetes"]
}
```

`markdown` 內容永遠不可被 `docs.json` 覆寫。

## 架構

| 檔案 | 職責 |
| --- | --- |
| `scripts/sync-content.mjs` | 掃描 README → `manifest.json`；同時解析 git remote 供連結改寫使用 |
| `scripts/smoke-test.mjs` | 以 `react-dom/server` 渲染每一頁並斷言結果 |
| `vite.config.ts` | Pages base path（由 repo 名稱推導，非寫死）、build 前 sync、dev 監看 README |
| `src/content.ts` | manifest 的型別化存取與相對路徑解析 |
| `src/components/Markdown.tsx` | markdown → MUI 元件對應、README 連結改寫 |
| `src/components/CodeBlock.tsx` | 語法高亮 + 複製按鈕（複製來源是 markdown AST 原字串） |
| `src/components/Toc.tsx` | 從 markdown 抽出 h2/h3；用 `github-slugger` 與 `rehype-slug` 對齊錨點 |

## 幾個實作上的決定

- **HashRouter**：GitHub Pages 沒有 SPA rewrite。hash 路由讓 `/#/k8s-install`
  這類深層連結直接可用，不需要 `404.html` 轉址技巧。站內錨點用
  `to={{ hash }}` 形式，才不會蓋掉當前路由。
- **連結改寫**：README 的相對連結是為 GitHub 寫的。指向「有 README 的資料夾」→ 轉為站內路由；
  指向檔案 → 轉為 GitHub blob 連結。
- **複製按鈕**取 markdown AST 的原始字串，不是 DOM 文字，所以含 `Copy` 字樣的指令不會被破壞。
- **單一 vendor chunk**：把 MUI 與 markdown 相關套件拆成兩個 chunk 會產生
  circular chunk，有 module 初始化順序風險。
