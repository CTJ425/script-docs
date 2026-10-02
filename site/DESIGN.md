---
name: ivan note
description: 一本工程師手札：暖色紙面上只有一種墨、髮絲線，和一個被打孔切穿的指令視窗，視窗的顏色是指令的出處
colors:
  paper-light: "#FBF7EC"
  paper-dark: "#141310"
  ink-light: "#16150F"
  ink-2-light: "#4D4937"
  ink-3-light: "#635E49"
  ink-dark: "#F2EDE0"
  ink-2-dark: "#BAB4A2"
  ink-3-dark: "#A29D8B"
  recess-light: "rgba(22, 21, 15, 0.055)"
  rule-light: "rgba(22, 21, 15, 0.17)"
  rule-strong-light: "rgba(22, 21, 15, 0.42)"
  recess-dark: "rgba(242, 237, 224, 0.06)"
  rule-dark: "rgba(242, 237, 224, 0.16)"
  rule-strong-dark: "rgba(242, 237, 224, 0.4)"
  binder-tan: "#7A5A34"
  chrome-yellow: "#F2B32B"
  teal: "#0F8A80"
  ultramarine: "#1F55B8"
  grass: "#4E8B3C"
  oxide-orange: "#DE5F26"
  violet: "#6A55C0"
  sienna: "#8C4A2B"
  vermilion: "#CE2E1A"
  vermilion-dark: "#FF7A63"
typography:
  display:
    fontFamily: "'Archivo', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 82"
  headline:
    fontFamily: "'Archivo', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "1.6875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "'Archivo', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "'EB Garamond', 'Noto Serif TC', Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.625rem"
  small:
    fontFamily: "'EB Garamond', 'Noto Serif TC', Georgia, serif"
    fontSize: "0.8125rem"
    lineHeight: 1.45
  label:
    fontFamily: "'Chivo Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  code:
    fontFamily: "'Chivo Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  die-cut: "2px"
  chip: "1px"
  hole: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
  page: "1180px"
  field: "880px"
  aside: "232px"
components:
  masthead:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink-light}"
    padding: "16px 0"
  masthead-link-current:
    textColor: "{colors.ink-light}"
  row:
    textColor: "{colors.ink-light}"
    padding: "16px 0"
  row-lead:
    textColor: "{colors.ink-3-light}"
    typography: "{typography.label}"
  tag:
    textColor: "{colors.ink-3-light}"
    typography: "{typography.code}"
  status-mark:
    textColor: "{colors.ink-light}"
  code-window:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
    typography: "{typography.code}"
    rounded: "{rounded.die-cut}"
    padding: "16px"
  code-window-head:
    backgroundColor: "{colors.binder-tan}"
    textColor: "{colors.paper-light}"
    typography: "{typography.label}"
    height: "34px"
    padding: "0 8px 0 16px"
  sudo-flag:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper-light}"
    typography: "{typography.label}"
    rounded: "{rounded.die-cut}"
    padding: "2px 8px"
  search-field:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.die-cut}"
    padding: "12px 16px"
  alert:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.die-cut}"
    padding: "16px 24px"
  alert-danger:
    backgroundColor: "rgba(206, 46, 26, 0.09)"
    textColor: "{colors.vermilion}"
    rounded: "{rounded.die-cut}"
    padding: "16px 24px"
  table-header-cell:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-2-light}"
    typography: "{typography.label}"
    padding: "12px 16px"
---

# Design System: ivan note

## Overview

**Creative North Star: "The Field Notebook"（工程師手札）**

這個世界是一本寫在暖色紙上的手札：一種墨、髮絲線，沒有卡片、沒有陰影、沒有漸層。列表是**一張紙被髮絲線切成一行一行**，不是一疊卡片。整個畫面只有一個飽和的東西 —— **被打孔切穿的指令視窗**，而它的顏色不是裝飾，是這條指令的**出處**：腳本頁上是該腳本所屬分類的顏色，文章裡是裝訂布的褐。

這個設計繼承自前一版「盒裝軟體參考手冊」（分頁板、乳白賽璐珞內頁、書口標籤）。那個外框是為三個分類的手冊設計的，裝不下一條隨時間長長的文章列表，所以拿掉了；留下來的是它最好的部分 —— 字體系統、紙紋、被算出來的色彩、指令視窗、頁面老化，以及「狀態用記號不用色相」。

材質是印刷品而非介面：紙面疊一張程序生成的紙紋（`--tooth`，180×180 的 fractalNoise tile，light 用 `multiply`、dark 用 `screen`），所有東西坐在同一張紙上。

**Key Characteristics:**

- 一張連續的紙；層級靠髮絲線、留白與字重，不靠陰影或卡片。
- 顏色**全部算出來**（`src/lib/design.mjs`），樣式表裡沒有任何色碼。
- 分類色**按位置指派**，永遠不按名稱；七色在冊，目前用三色。
- 朱紅被整個抽離出色盤，只花在危險上。
- 動態只有一種文法：`90ms steps(2, end)` 的兩格鉸鏈。
- 狀態用**記號加文字**表示：方塊、圓、摺痕、打孔。
- 前端只持有 chrome；散文一律是 markdown 檔。

## Colors

### 紙與墨

- **Paper**（light `#FBF7EC` / dark `#141310`）：唯一的底。暖調的手冊紙，與石墨乳白。
- **Ink / Ink-2 / Ink-3**：正文墨、次要墨、最輕的墨（日期、標籤、指令裡的註解）。三階在深色下靠得很近，因為最輕的那一階必須在「泛黃的凹槽」上仍然 ≥ 4.5:1。
- **Recess / Rule / Rule-strong**：凹槽底、髮絲線、強分隔線，全部是墨色的低不透明度疊加，不是獨立灰階。

### 分類色（打孔視窗的頭）

七個色相排成一列，`hueFor(index)` 依分類在顯示順序中的位置取用並取模循環，超出七個也不會退回灰色：鉻黃（`AI/`）、青（`container/`）、群青（`script/`），其後是草綠、鏽橙、紫、赭，備用。

- **Binder Tan**（`#7A5A34`）：不屬於任何分類的東西（文章、工具、頁面）用的色，也是預設的強調色。刻意選帶彩度的褐：沒有彩度的色混進暖紙只會漂白它。
- 每個色相有三種用法，都由 `resolveHue()` 對當前主題解出：**fill**（視窗頭，滿版強度，深色主題下壓暗並保證可印字）、**on-fill**（`inkOn()` 從兩支墨裡挑贏的那一支）、**ink**（把同一色相往頁面的墨混，直到在**每一個**可能落字的底上都 ≥ 4.5:1）。

### 危險

- **Vermilion**（light `#CE2E1A` / dark `#FF7A63`）：被抽出整個系統，只用於 `sudo` 標記、`WARNING` / `CAUTION` 警示與 404 面板。兩個值是因為在暖紙上讀得動的朱紅，在石墨紙上讀不動。

### Named Rules

**The Derived Colour Rule.** `--paper`、`--ink*`、`--rule*`、`--recess`、`--danger*`、`--fill`、`--on-fill`、`--accent` 與 `.hue-N` 全部由 `colorCss()` 生成並內嵌進 `<head>`。樣式表只消費它們。想加一個顏色語意，加的是推導規則，不是色票。

**The Position-Not-Name Rule.** 分類色按順序中的位置指派，永遠不按名稱。程式碼裡不存在 `AI` 這個字串對應鉻黃的地方。

**The Vermilion Reserve Rule.** 朱紅只有一個意思：這會弄壞讀者的機器（或這一頁不存在）。不當品牌色、強調色、hover 色，也不是第八個分類色。

**The Every-Surface Rule.** 墨不只要在紙上讀得動：它要在凹槽上、在老化後的紙上、在老化後的凹槽上、在危險底上都 ≥ 4.5:1。`surfacesFor()` 列出所有這些底，推導與測試都走同一份清單。

**The Computed Contrast Rule.** 對比下限由 `npm test`（`scripts/check-contrast.mjs`）強制：三階墨 × 所有底、危險墨、視窗頭上的字、八個色相的 hue-as-ink，兩種主題。新增色相或調整墨色會在這裡失敗，而不是在讀者的螢幕上。

## Typography

**Display Font:** Archivo（回退 Noto Sans TC、system-ui）
**Body Font:** EB Garamond（回退 Noto Serif TC、Georgia）
**Label/Mono Font:** Chivo Mono（回退 ui-monospace、SFMono-Regular）

三支字體各做一件事。Archivo 是寬度 × 字重的格點，正是 Univers 的本質；中文的同一個位置交給 Noto Sans TC，因為手札的標題本來就是黑體、內文本來就是明體。EB Garamond 承 Sabon 的血統，負責每一個要被讀進去的字。Chivo Mono 與 Archivo 同廠同骨架，負責機器的聲音。

### Hierarchy

- **Display**（800，`clamp(2.25rem, 4vw, 3.5rem)`，`wdth 82`，全大寫，`text-wrap: balance`）：頁面標題、README 的 H1。首頁站名放大到 `clamp(3rem, 9vw, 6.5rem)`。
- **Headline**（700，1.6875rem，`wdth 88`）：H2，上方一條 `--rule-strong` 的橫線。緊跟在 `---` 後面時線與留白取消。
- **Title**（700，1.25rem，`wdth 92`）：H3，也是列表一行的標題。
- **Body**（400，1.0625rem / 1.625rem，最大 75ch）：所有散文。
- **Small**（0.8125rem）：目錄、相關連結、表格內文。
- **Label**（Chivo Mono 500，0.75rem，`0.1em`，全大寫，tabular-nums）：日期、分類名、狀態、位元組數、複製鈕。
- **Code**（Chivo Mono，0.8125rem / 1.7，`tab-size: 2`）：指令視窗內的每一行。

### Named Rules

**The Width-Axis Rule.** 標題的層級由 Archivo 的寬度軸承擔一部分：H1 `wdth 82`、H2 `88`、H3 `92`。不要用預設寬度設標題。

**The One Body Size Rule.** 內文只有一個級數。層級靠字重、髮絲線與留白，不靠第二套級距。行長是 `75ch`：`ch` 是拉丁 `0` 的寬度，繁體中文在 62ch 只有約 30 字，75ch 讓拉丁落在上限、中文落在約 34 字，一個值同時成立。

**The Machine Voice Rule.** 等寬字只給機器說過或量過的東西：指令、標籤、位元組數、日期、狀態。沒有機器在說話的地方就不要用它。標籤是 12px 而不是 11px，因為標籤裡也有中文。

## Layout

版面是**一欄紙**。頂部 `masthead`（站名、四個導覽、搜尋 / 主題 / GitHub）下面一條 `--rule-strong`；其下是 `--page`（1180px）寬的頁面欄，兩側是 `--gutter`（16–40px）；底部一條髮絲線與頁尾。沒有側欄、沒有固定分頁板。

**一份文件**（文章、工具、腳本）是兩欄：`minmax(0, 880px)` 的閱讀欄與 232px 的邊欄，間距 64px。邊欄裡是本頁目錄（`sticky`）、標籤與相關連結。**1100px 以下**邊欄收起：目錄變成閱讀欄上方一個可摺疊的區塊，相關連結落到文章底下。

閱讀欄裡：散文守住 `75ch`；**表格與指令視窗取整條閱讀欄寬**，因為一行折行的 `curl` 是沒人能在執行前檢查的指令。視窗再寬，也只是橫向捲動。

**列表**（`.row`）是整站唯一的列表文法：左欄 9.5rem 的機器聲（日期、狀態、分類），右欄是標題、一行摘要與標籤。首頁、列表頁、標籤頁與搜尋結果都是它。640px 以下左欄折到標題上方。

### Named Rules

**The Measure Rule.** 散文永遠不超過 75ch；表格與指令視窗永遠可以吃掉整條閱讀欄。判準是「這段東西是拿來讀的，還是拿來檢查後複製的」。

**The One-List Rule.** 文章、工具、腳本、標籤頁、搜尋結果用同一個 `.row`。不為新的內容種類發明新的列表。

**The Chrome-Only Rule.** 前端只擁有 chrome —— 站名（讀自根 README）、標語、導覽與介面用語。頁面上所有散文都是 markdown 檔，DESIGN.md 的任何規則都不得被理解成允許在 `.astro` 裡寫內容。

## Elevation & Depth

這個世界**沒有海拔**。沒有卡片、沒有 z 軸層級、沒有陰影。深度只有一種來源：凹槽。指令視窗、搜尋欄、警示框與表格是從紙面「凹下去」的 `--recess`，邊界是 1px 的髮絲線。整份樣式表裡**沒有任何 `box-shadow` 拿來做深度**；它只用來畫記號：搜尋欄的焦點、目前導覽項的底線、搜尋命中的標示、`dry-run` 旗標的描邊，以及目錄打孔記號外那一圈紙色間隙。

### Named Rules

**The No-Stack Rule.** 一張連續的紙，永遠不是一疊卡片。需要區隔就畫線或留白；需要強調就換墨色或字重。

**The Printed-Not-Filled Rule.** 紙不是純色填滿，而是色 + `--tooth` 紙紋，以 `multiply`（light）／`screen`（dark）混合。

## Shapes

形是**模切**出來的，不是圓潤的。圓角只有一個值：`--r: 2px`，用在指令視窗、搜尋欄、警示框、表格外框、標籤片與按鈕。例外各有物理理由：分類色塊 1px（那是一個小方塊）、狀態方塊與目錄記號（打出來的洞，50%）。

邊界一律 1px 實線，取自 `--rule` 或 `--rule-strong`。沒有雙線、沒有虛線、沒有外框發光。

focus 是一枚打上去的定位記號，不是光暈：`outline: 2px solid var(--accent)`、`outline-offset: 2px`；站在視窗頭上的元件改用 `--on-fill`。

## Components

### Masthead（頁首）

站名（Archivo 800、1.5rem、全大寫、`wdth 82`）、四個導覽（文章 / 工具 / 腳本 / 關於，Archivo 600）、右側三個 38px 的工具鈕（搜尋、深淺色、GitHub）。目前所在的導覽項以 `--accent` 的 2px 底線標示。窄螢幕上工具鈕折到第二行，不另做選單。

### Row（列）

見 Layout。標題 `Title` 級、摘要 `--ink-2`、標籤等寬 `--ink-3`。工具列在標題旁有「自製」標記（1px 邊框的標籤片）。**一行就是一條髮絲線**，不加底色、不加圖示。

### Status Mark（狀態記號）

三個形狀加一個詞，缺一不可：**使用中**＝實心方塊、**試過**＝空心方塊、**已淘汰**＝被斜線劃掉的方塊。把顏色抽掉仍然讀得出來。

### Tags（標籤）

等寬、`--ink-3`、前面一個淡淡的 `#`；hover 轉為 `--accent` 並加底線。標籤頁是同一個詞放大成 Archivo 600，後面是出現次數。

### Code Window（打孔指令窗）

全站最具代表性的元件。指令是唯一會跟著讀者離開網站的東西，所以它不是灰底方塊，而是把紙挖穿到一個滿版強度的頭。

- **抬頭:** 滿版 `--fill`，`--on-fill` 文字；左側語言名（label 級），右側複製鈕。`--fill` 在腳本頁是該分類的色，在其他頁是裝訂褐。
- **旗標:** 指令字串裡含 `sudo` 時出現一枚朱紅填色的標記；含 `--dry-run` 時出現一枚描邊標記。兩者都是對指令自身文字的事實陳述，不是評價。
- **內容:** `--recess` 底，等寬 0.8125rem / 1.7，橫向可捲。`<pre>` 的文字**就是**指令，沒有行包裝，複製鈕讀的就是它的 `textContent`。
- **語法著色只有三種墨:** 機器執行的東西用 `--ink` 加粗；被交代去執行的東西（參數、變數、網址、屬性）用 `--accent`；註解、標點、運算子退到 `--ink-3`；字串用 `--ink-2`。`prefers-contrast: more` 時 `--accent` 那一組退回 `--ink`。

### Provenance Strip（來源列，僅腳本頁）

腳本頁頂端、一條 `--rule-strong` 線上的等寬條：SOURCE（連到 GitHub 上的檔案）、BYTES、REV（修訂日期與天數）、CATEGORY。這是全站唯一競爭者無法照抄的一句話。它陳述的全是**派生狀態**，不是散文；頁面也帶著它渲染所用位元組的指紋（`data-sha`），`verify-dist` 會拿磁碟上的檔案重算並比對。

### Contents（本頁目錄）

0.8125rem，`--ink-3`；H3 再縮排、降到 0.75rem。**狀態是記號，不是色相**：尚未讀到＝空心圓圈；已讀過＝一道 135° 的摺痕；當前＝實心打孔（`--accent` 填色，外加一圈紙色的間隙環）。三者是不同的**形狀**。

### Alerts（GitHub alert）

`--recess` 底、1px `--rule-strong`、label 級的全大寫標題。`WARNING` / `CAUTION` 換成 `--danger` 邊框、`--danger-field` 底與 `--danger-ink` 標題 —— 朱紅在正文裡唯一的出場。

### Tables（表格）

整條閱讀欄寬、1px `--rule` 外框；表頭是 `--recess` 底的 label 級；列首欄加粗並不換行；hover 一列上 `--recess`。

### Search（搜尋）

一個 `--recess` 底的視窗，等寬輸入字；`:focus-within` 時邊框與 `inset 1px` 換成 `--accent`。結果是 `.row`，命中處是底線加粗的 `<mark>`。搜尋靠 Pagefind 的靜態索引，只在 build 之後存在；開發模式下頁面會明說。

### 404 Panel

朱紅的另一個正當出場：1px `--danger` 邊框、`--danger-field` 底、`--danger-ink` 的 `404`。

### Icons

六支圖示全部手繪在 `src/components/Icon.astro`：20 的框、1.5 的線寬、`currentColor` 描邊、無填色（GitHub 標誌除外，它是商標必須是它自己）。沒有圖示字型、沒有圖示套件、沒有 emoji 當介面圖示。

### Motion

**The Two-Frame Hinge Rule.** 全站只有一種動態文法：`--hinge: 90ms steps(2, end)`，只用在 hover 與按壓。沒有任何 easing、沒有任何 fade、沒有 `scroll-behavior: smooth`（改用 `scroll-padding-top` 讓錨點落在標題上）。`prefers-reduced-motion: reduce` 下全部關閉。

### Ageing

`ageOf()` 把「最後更新」換算成三階材質：0 新鮮、1 泛黃（≥ 90 天）、2 褪白（≥ 270 天）。泛黃是疊在紙上的一層暖色（`--age-N`），**不是**取代紙，所以每一種墨在泛黃的紙上仍然守住對比。閾值對應這些 runbook 釘住的 Kubernetes 與 Supabase 版本的實際失效期，不是為了截圖好看。這個狀態只花在紙的材質與一個天數標記上，**永遠不會變成新的散文**。

## Do's and Don'ts

### Do:

- **Do** 讓新的顏色語意經過 `design.mjs` 的推導函式（`resolveHue()`、`inkFor()`、`readableOn()`、`inkOn()`），而不是新增手調色票。
- **Do** 為新增的分類只做一件事：新增一個頂層資料夾。色相與分組都會自己長出來。
- **Do** 在改動色相、墨色或底之後跑 `npm test`；`check-contrast.mjs` 是這套系統唯一的對比裁判。
- **Do** 用 `--hinge` 當所有過場的唯一值，並尊重 `prefers-reduced-motion`。
- **Do** 讓散文守住 75ch，讓表格與指令視窗取整條閱讀欄寬。
- **Do** 用記號（形狀）加文字表達狀態。
- **Do** 為新的內容種類重用 `.row`、`.tags`、`.status` 與 `.prose`。
- **Do** 需要新圖示時照 20 框 / 1.5 線寬 / 無填色的規格手繪一支。

### Don't:

- **Don't** 在任何 CSS 裡寫色碼或 `rgb()`；顏色一律是 `design.mjs` 生成的 custom property。
- **Don't** 把任何分類名稱綁到特定色相；指派永遠按位置。
- **Don't** 把朱紅用在危險以外的任何地方。
- **Don't** 加入 easing、fade、`transition: all`、`scroll-behavior: smooth` 或任何超過兩格的動畫。
- **Don't** 用陰影或卡片堆疊來分隔內容。
- **Don't** 加入漸層裝飾、毛玻璃、藥丸圓角或 `--r`（2px）以外的圓角（上述例外除外）。
- **Don't** 為標題引入第二套字級；層級由字重、Archivo 的寬度軸與留白承擔。
- **Don't** 只用顏色表達狀態。
- **Don't** 引入圖示字型、圖示套件，或拿 emoji 當介面圖示。
- **Don't** 引入第四支字族，也不要讓 `system-ui` / Georgia 從回退位置升格成實際使用的顯示字體。
- **Don't** 在 `.astro` / `.ts` 裡寫任何頁面散文；那是 markdown 檔的工作。
- **Don't** 在腳本頁上加任何 README 沒說過的字。
