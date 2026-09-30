# 文件入口網站 (site/)

React + 自訂設計系統的文件網站，部署到 GitHub Pages：<https://ctj425.github.io/script-docs/>

外觀是一本「打開在某個分頁上的盒裝軟體參考手冊」：分類是一片滿版色的分隔板，
README 是懸在它上方的乳白透明內頁，書口有一排階梯式分頁標籤。設計決策記在
[`DESIGN.md`](./DESIGN.md)。

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
npm run test       # 對比度斷言 + 渲染每一頁並驗證錨點、程式碼區塊、連結、內容一致性
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
| `scripts/check-contrast.mjs` | 對每個分類色板、兩種主題斷言 ink 對內頁 ≥ 4.5:1 |
| `src/content.ts` | manifest 的型別化存取與相對路徑解析 |
| `src/design.ts` | 設計系統：色彩數學、色板指派、內頁 alpha 求解、頁面年齡 |
| `src/styles/*.css` | token、基礎層、外殼、閱讀欄、markdown、程式碼視窗 |
| `src/components/Markdown.tsx` | markdown → 語意元素對應、README 連結改寫 |
| `src/components/CodeBlock.tsx` | 語法高亮 + 複製按鈕（複製來源是 markdown AST 原字串） |
| `src/components/Toc.tsx` | 從 markdown 抽出 h2/h3；用 `github-slugger` 與 `rehype-slug` 對齊錨點 |

## 幾個實作上的決定

- **HashRouter**：GitHub Pages 沒有 SPA rewrite。hash 路由讓 `/#/k8s-install`
  這類深層連結直接可用，不需要 `404.html` 轉址技巧。站內錨點用
  `to={{ hash }}` 形式，才不會蓋掉當前路由。
- **連結改寫**：README 的相對連結是為 GitHub 寫的。指向「有 README 的資料夾」→ 轉為站內路由；
  指向檔案 → 轉為 GitHub blob 連結。
- **複製按鈕**取 markdown AST 的原始字串，不是 DOM 文字，所以含 `Copy` 字樣的指令不會被破壞。
- **單一 vendor chunk**：把 markdown 與語法高亮拆成兩個 chunk 會產生 circular
  chunk，有 module 初始化順序風險。
- **內頁 alpha 在執行期解出**：閱讀區是乳白透明內頁疊在滿版色分隔板上，alpha 用
  二分搜尋逼到合成後亮度落進固定區間，才發佈成 custom property。所以「站在哪個
  分類上」不會改變正文對比度 —— 這是計算保證，不是挑色號挑出來的，
  `check-contrast.mjs` 對每個色板（含尚未使用的四個）逐一斷言。
- **狀態用記號而不是顏色**：目次的已讀／當前／未讀是摺痕、打孔、勾點三種形狀，
  色盲或去色後仍可讀。
