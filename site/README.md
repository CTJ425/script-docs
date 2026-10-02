# 網站原始碼 (site/)

> 最後更新：2026-10-02

[ivan note](../README.md) 的網站：Astro 靜態站，把這個 repo 裡的文章、工具與腳本 README 產生成一個個人資訊部落格。設計決策記在 [`DESIGN.md`](./DESIGN.md)，產品定位記在 [`../PRODUCT.md`](../PRODUCT.md)。

## 內容從哪來

網站不儲存任何內容。每一頁都直接來自 repo 裡的檔案，而**誰擁有那些字**由檔案種類決定：

| 種類 | 來源 | 網址 | 載入方式 |
| --- | --- | --- | --- |
| 文章 | `../posts/<slug>.md` | `/posts/<slug>/` | content collection（`glob` loader）+ frontmatter |
| 工具 | `../tools/<slug>.md` | `/tools/<slug>/` | 同上 |
| 首頁、關於 | `../pages/{home,about}.md` | `/`、`/about/` | 同上 |
| 腳本 | `../<分類>/<專案>/README.md` | `/scripts/<專案>/` | 自訂 loader：把 README 當**位元組**讀進來，一個字都不改 |

腳本頁是特別的一種。網站上看到的就是那份 README，旁邊只多一條**來源列**（檔名、位元組數、修訂日期、分類），都是派生狀態而不是散文。`verify-dist` 會對每支腳本重算磁碟上檔案的指紋，和頁面渲染時記下的比對。

**站名與標語**讀自根 `README.md`：第一個 `#` 是站名，第一段是標語。頁首、首頁 `<title>`、RSS 都從那裡來，所以不可能各叫各的。

## 指令

```bash
npm ci

npm run dev         # 開發伺服器（搜尋頁在 build 之前沒有索引，會直接說明）
npm run build       # astro build，接著用 Pagefind 建立搜尋索引 → dist/
npm run preview     # 預覽 dist/

npm run check       # astro check：型別檢查
npm run test        # check-contrast（對比度）+ verify-content（build 前的內容規則）
npm run test:dist   # verify-dist：檢查 build 出來的網站（需先 build）
npm run verify      # 以上全部，依序；CI 跑的同一道關卡
```

## 部署

網站是純靜態的（`dist/`）。部署在哪裡由環境變數決定，不用改程式：

| 變數 | 意思 | 預設 |
| --- | --- | --- |
| `SITE_URL` | 對外網址的 origin，例如 `https://note.example.com` | GitHub Actions 上是 `https://<owner>.github.io`；Cloudflare Pages 上是 `CF_PAGES_URL` |
| `BASE_PATH` | 路徑前綴；網域根目錄就是 `/` | GitHub Actions 上是 `/<repo>`；其他地方是 `/` |

**GitHub Pages**（目前）：`.github/workflows/pages.yml` 在 push 到 `main` 且動到內容或 `site/` 時重新部署。

**Cloudflare Pages**（之後）：

- Root directory：`site`
- Build command：`npm ci && npm run build`
- Build output directory：`dist`
- 環境變數：`NODE_VERSION=22`，並把 `SITE_URL` 設成正式網域

`public/_headers` 讓 `/_astro/*`（檔名帶雜湊）可以永久快取。搬家之後可以把 `pages.yml` 刪掉。

## 架構

| 檔案 | 職責 |
| --- | --- |
| `astro.config.mjs` | origin 與 base path（來自環境）、sitemap、把站名與標語注入成建置期常數 |
| `scripts/content-sources.mjs` | 純 Node：找出腳本 README（兩層深度規則、slug、摘要、修訂日期）、讀 `docs.json`、讀站名、判斷部署位置。**不可被 bundle 進伺服器端程式** |
| `src/content.config.ts` | 四個 collection 與它們的 schema（frontmatter 寫錯會在這裡失敗並指出哪個欄位） |
| `src/lib/markdown.mjs` | 唯一的 markdown 管線：GFM → 清理 → 標題 id → 站內轉換（alerts、連結改寫、指令視窗、表格外框） |
| `src/lib/design.mjs` | 設計系統：色彩數學、色相指派、所有「墨會落在哪些底上」、頁面年齡、`colorCss()` |
| `src/lib/content.ts` | 頁面對內容的所有查詢：排序、草稿規則、文章／工具／腳本之間的交叉參照、標籤索引 |
| `src/layouts/Base.astro` | `<head>`（title、description、canonical、Open Graph、RSS、內嵌色彩與主題初始化）、頁首、頁尾 |
| `src/pages/` | 首頁、文章、工具、腳本、標籤、搜尋、關於、404、`rss.xml`、`robots.txt` |
| `src/client/` | 唯一會出貨的 JavaScript：主題切換、複製鈕、目錄記號；搜尋頁自己的腳本 |
| `scripts/check-contrast.mjs` | 每一種墨在每一種底上 ≥ 4.5:1，兩種主題，所有色相 |
| `scripts/verify-content.mjs` | build 前：站名、規則檔一致、腳本 README 的 H1 與日期、frontmatter 的形狀 |
| `scripts/verify-dist.mjs` | build 後：路由、連結與錨點、每頁 meta、feed、sitemap、搜尋索引、腳本逐位元組 |

## 幾個實作上的決定

- **為什麼是 Astro**：這個站需要真實網址、每頁自己的分享預覽、RSS 與可被搜尋引擎讀的索引。前一版是 React 單頁應用加 HashRouter（網址是 `/#/slug`），這三樣都做不到。
- **自己的 markdown 管線，而不是 Astro 內建的**：文章、工具、頁面與腳本 README 必須長得一樣，而腳本 README 需要照著檔案路徑改寫相對連結。一條管線、一個純 Node 模組，所以 verify 腳本跑的就是 build 跑的那一份。
- **清理在站內轉換之前**：`rehype-sanitize` 先跑，所以後面加上去的 class 與屬性不會被剝掉，而內容裡任何 `<script>` 或事件處理器都進不來。
- **連結改寫**：README 的相對連結是為 GitHub 寫的。指向「是已發佈腳本的資料夾」→ 站內路由；指向其他檔案 → GitHub 連結；指向 repo 之外或協定不安全 → 只留下文字。
- **複製鈕讀 `<pre>` 的文字**：`<pre>` 裡只有指令，沒有行包裝，所以複製出去的就是檔案裡寫的那串字。`verify-dist` 逐區塊比對。
- **腳本不內嵌**：`assetsInlineLimit: 0`。Vite 會把搜尋頁對 Pagefind 的動態 `import()` 包進一個預載輔助函式，只有在腳本是獨立檔案時才解得開。
- **顏色在 `<head>` 內嵌**：第一次繪製就有顏色，沒有額外請求；也只有一份定義，測試量的就是出貨的。
- **版面與色彩都不在執行期計算**：前一版在瀏覽器裡對每條路由做二分搜尋。現在的色彩是建置期推導、以測試保證，沒有 effect、沒有閃爍。
