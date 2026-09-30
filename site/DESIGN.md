---
name: Script Docs
description: 一本裝訂成冊的維運手冊：分頁板上懸著一張乳白賽璐珞內頁，內文逐位元組來自 README.md
colors:
  chrome-yellow: "#F2B32B"
  teal: "#0F8A80"
  ultramarine: "#1F55B8"
  grass: "#4E8B3C"
  oxide-orange: "#DE5F26"
  violet: "#6A55C0"
  sienna: "#8C4A2B"
  binder-tan: "#7A5A34"
  vermilion: "#CE2E1A"
  vermilion-dark: "#FF7A63"
  milk-light: "#FBF7EC"
  milk-dark: "#141310"
  ink-light: "#16150F"
  ink-2-light: "#57533F"
  ink-3-light: "#68634d"
  ink-dark: "#F2EDE0"
  ink-2-dark: "#A9A391"
  ink-3-dark: "#8D8875"
  recess-light: "rgba(22, 21, 15, 0.055)"
  rule-light: "rgba(22, 21, 15, 0.17)"
  rule-strong-light: "rgba(22, 21, 15, 0.42)"
  recess-dark: "rgba(242, 237, 224, 0.06)"
  rule-dark: "rgba(242, 237, 224, 0.16)"
  rule-strong-dark: "rgba(242, 237, 224, 0.4)"
typography:
  display:
    fontFamily: "'Archivo', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1.02
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
  subtitle:
    fontFamily: "'Archivo', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  body:
    fontFamily: "'EB Garamond', 'Noto Serif TC', Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.625rem"
    letterSpacing: "normal"
  small:
    fontFamily: "'EB Garamond', 'Noto Serif TC', Georgia, serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Chivo Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.1em"
    fontFeature: "'ss01'"
  code:
    fontFamily: "'Chivo Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  die-cut: "2px"
  chip: "1px"
  thumb: "99px"
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
  spine: "40px"
  rail: "56px"
  index: "288px"
  band: "76px"
components:
  band:
    backgroundColor: "{colors.binder-tan}"
    textColor: "{colors.milk-light}"
    height: "{spacing.band}"
    padding: "0 16px 0 24px"
  band-button:
    textColor: "{colors.milk-light}"
    rounded: "{rounded.die-cut}"
    size: "38px"
  tab:
    backgroundColor: "{colors.chrome-yellow}"
    textColor: "{colors.ink-light}"
    typography: "{typography.label}"
    height: "72px"
    padding: "16px 0"
  tab-open:
    backgroundColor: "{colors.chrome-yellow}"
    textColor: "{colors.ink-light}"
    typography: "{typography.label}"
  index-item:
    textColor: "{colors.ink-2-light}"
    typography: "{typography.small}"
    padding: "8px 24px 8px 40px"
  index-item-current:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
  search-field:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.die-cut}"
    padding: "8px 12px"
  code-window:
    backgroundColor: "{colors.recess-light}"
    textColor: "{colors.ink-light}"
    typography: "{typography.code}"
    rounded: "{rounded.die-cut}"
    padding: "16px"
  code-window-head:
    backgroundColor: "{colors.binder-tan}"
    textColor: "{colors.milk-light}"
    typography: "{typography.label}"
    height: "34px"
    padding: "0 8px 0 16px"
  sudo-chip:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.milk-light}"
    typography: "{typography.label}"
    rounded: "{rounded.die-cut}"
    padding: "2px 8px"
  copy-button:
    textColor: "{colors.milk-light}"
    typography: "{typography.label}"
    rounded: "{rounded.die-cut}"
    padding: "4px 12px"
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

# Design System: Script Docs

## Overview

**Creative North Star: "The Boxed-Software Reference Manual"**

這個世界是一本盒裝軟體的參考手冊：一塊印到滿版強度的**分頁板（board）**，上面懸著一張薄薄一毫米的**乳白賽璐珞內頁（leaf）**。內頁是閱讀區，分頁板是分類。你不是在一份清單裡點選一個分類名稱，你是站在那個分類的顏色上。左緣有兩個裝訂孔與一條旋轉書背標，右側書口是一整排階梯式索引標籤，每個分類一片，高度按該分類的頁數分配，開啟中的那一片切出書口、變成當前的分頁板。

這個系統最不尋常的地方是：**閱讀區的顏色在 CSS 裡根本不存在**。`--board`、`--leaf`、`--on-board`、`--board-ink`、`--danger-ink` 由 `site/src/design.ts` 在執行期針對當前路由與主題解出，再寫上 `<html>`。內頁的 alpha 不是設計師挑的數字，而是對 sRGB source-over 合成做二分搜尋，直到合成後的閱讀區落進固定的相對亮度帶（light `0.78`、dark `0.0115`）。因此不論讀者站在鉻黃還是群青上，內文對比度都相同——對比是**算出來的，不是看出來的**，而且由 `npm test` 擋住。

材質是印刷品而非介面：分頁板與內頁都疊同一張程序生成的紙紋（`--tooth`，180×180 的 fractalNoise tile，light 用 `multiply`、dark 用 `screen`）。沒有卡片堆疊、沒有漸層裝飾、沒有毛玻璃、沒有圓角藥丸。整份文件是**一張連續的內頁**，層級靠髮絲線與留白，不靠陰影。

**Key Characteristics:**

- 分頁板滿版上色，內頁半透明壓在上面；顏色由執行期解算，不由 CSS 常數決定。
- 分類色**按照分類在 manifest 中的位置指派**，永遠不按名稱；七色在冊，目前用三色。
- 朱紅（vermilion）被整個抽離出分類色盤，只花在危險上。
- 一種內文級數、75ch 行長；標題不長大，而是掛進外側的 margin 欄。
- 動態只有一種文法：`90ms steps(2, end)` 的兩格鉸鏈。沒有任何 easing、沒有任何 fade、也沒有 `scroll-behavior: smooth`。
- 狀態用**記號**表示，不用色相：勾、摺痕、打孔。
- 前端只持有 chrome；頁面內容一律是 README.md 的逐位元組渲染。

## Colors

色盤是一組印刷級、滿版強度的分頁板色，配上一張暖調手冊紙（dark 模式是石墨乳白）的閱讀區；兩者之間的每一個實際數值都是解出來的。

### Primary — 分頁板（section boards）

七個色相排成一列，`hueFor(index)` 依分類在側欄順序中的位置取用並取模循環，超出七個也不會退回灰色。板色只在滿版場合出現：頂部 band、左側 spine、書口 tab rail、指令視窗的抬頭。

- **Chrome Yellow**（`{colors.chrome-yellow}`）：第 1 個分類，目前是 `AI/`。亮度高，`inkOn()` 判給它深墨。
- **Teal**（`{colors.teal}`）：第 2 個分類，目前是 `container/`。中亮度，`printable()` 會把它推到 `#168d83` 才印得上字。
- **Ultramarine**（`{colors.ultramarine}`）：第 3 個分類，目前是 `script/`。判給淺墨。
- **Grass / Oxide Orange / Violet / Sienna**（`{colors.grass}`、`{colors.oxide-orange}`、`{colors.violet}`、`{colors.sienna}`）：在冊備用。新增第四個頂層資料夾就會自動落在 grass，不需要改任何一行程式。

### Secondary — 裝訂本身

- **Binder Tan**（`{colors.binder-tan}`）：總覽頁不屬於任何分類，用的是裝訂布本身的色。刻意選帶彩度的褐而非中性灰——沒有彩度的色混進乳白只會漂白它，首頁會變成暖紙世界裡的一塊冷灰。

### Tertiary — 危險

- **Vermilion**（`{colors.vermilion}` / dark `{colors.vermilion-dark}`）：被抽出整個系統，只用於破壞性指令、errata、`sudo` 標記與 404 面板。兩個值是因為在暖紙上讀得動的朱紅，在石墨紙上讀不動。

### Neutral — 紙與墨

- **Milk**（`{colors.milk-light}` / `{colors.milk-dark}`）：賽璐珞本身，在壓到任何板色之前。實際閱讀區是它帶著 `TINT = 0.14` 的板色、再被 `atLuminance()` 校回原亮度之後，以解出的 alpha 壓在板上的結果。
- **Ink / Ink-2 / Ink-3**：正文墨、次要墨、標籤墨，light 與 dark 各一組。因為閱讀區的亮度被 `solveLeaf()` 釘住，這三支才能寫成固定值。
- **Recess / Rule / Rule-strong**：凹槽底、髮絲線、強分隔線，全部是墨色的低不透明度疊加，不是獨立灰階。

### Named Rules

**The Solved Field Rule.** `--board`、`--leaf`、`--on-board`、`--board-ink`、`--danger-ink` 永遠不是 CSS 常數。它們由 `AppShell.tsx` 的 effect 逐路由、逐主題解出並寫上 `document.documentElement`，所有樣式表只能消費。想加一個顏色語意，加的是解算規則，不是色票。

**The Position-Not-Name Rule.** 分類色按 manifest 順序中的位置指派，永遠不按分類名稱。程式碼裡不存在 `AI` 這個字串對應鉻黃的地方。

**The Vermilion Reserve Rule.** 朱紅不進分類色盤。它只有一個意思：這會弄壞讀者的機器。任何把朱紅當強調色、當品牌色、當 hover 色的用法都破壞這條規則。

**The Computed Contrast Rule.** 對比下限由 `npm test`（`site/scripts/check-contrast.mjs`）強制，不靠自律。腳本對八塊板（七個分類色加裝訂褐）× 兩種主題逐一斷言：三級墨壓在解出的閱讀區上、`inkOn()` 選出的墨壓在滿版板上、`readableOn()` 混過的板色當墨、`readableOn()` 混過的朱紅當墨，全部 ≥ 4.5:1；再加上朱紅填色上的文字，以及 90/270 天的老化階梯。新增色相或重調亮度帶會在這裡失敗，而不是在讀者的螢幕上。

**The Ink-Is-Never-Hand-Tuned Rule.** 板色要當小字用，不是另外挑一個「文字版」色票，而是用 `readableOn()` 把同一個色相往頁面自己的墨色混，直到過 4.5:1；要印在滿版板上的字則用 `inkOn()` 從兩支墨裡挑贏的那一支。明年新增的分類自動被同一套搜尋涵蓋。

## Typography

**Display Font:** Archivo（回退 Noto Sans TC、system-ui）
**Body Font:** EB Garamond（回退 Noto Serif TC、Georgia）
**Label/Mono Font:** Chivo Mono（回退 ui-monospace、SFMono-Regular）

**Character:** 三支字體各自做一件事，而且只做一件。Archivo 是寬度 × 字重的格點，正是 Univers 的本質；中文的同一個位置交給 Noto Sans TC，因為手冊的標題本來就是黑體、內文本來就是明體。EB Garamond 承 Sabon 的血統，負責每一個要被讀進去的字。Chivo Mono 與 Archivo 同廠同骨架，負責機器的聲音。

### Hierarchy

- **Display**（800，`clamp(2.25rem, 4vw, 3.5rem)`，`wdth 82`，全大寫，`text-wrap: balance`）：README 的 H1，全站最大的一行。
- **Headline**（700，1.6875rem，`wdth 88`）：H2。上方帶一條 `--rule-strong` 的橫線與 48px 留白；緊跟在 `---` 後面時線與留白都取消，因為 grid 軌道不會塌陷相鄰邊界。
- **Title**（700，1.25rem，`wdth 92`）：H3。
- **Subtitle**（600，1.0625rem，`+0.02em`）：H4–H6，與內文同級數，只靠字重與字族分辨。
- **Body**（400，1.0625rem / 1.625rem，最大 75ch）：所有 README 正文。
- **Small**（0.8125rem）：索引項、TOC、來源列的值、表格內文。
- **Label**（Chivo Mono 500，0.6875rem，`0.1em`，全大寫，tabular-nums，`ss01`）：分類名、標籤、來源鍵、指令視窗語言名、複製鈕。
- **Code**（Chivo Mono，0.8125rem / 1.7，`tab-size: 2`）：指令視窗內的每一行。

### Named Rules

**The Width-Axis Rule.** 標題的層級由 Archivo 的寬度軸承擔一部分：H1 `wdth 82`、H2 `88`、H3 `92`。寬度是這套顯示聲音的一部分，不是可有可無的裝飾；不要用預設寬度設標題。

**The One Body Size Rule.** 內文只有一個級數。密集的 README 靠字重、髮絲線與留白得到骨架，不靠第二套級距。行長寫成 `75ch` 而不是 62ch——`ch` 是拉丁 `0` 的寬度，繁體中文在 62ch 只有約 30 字，遠短於中文排版所需；75ch 讓拉丁落在上限、中文落在約 34 字，一個值同時成立。（世界宣言寫的是 62ch，出貨的是 75ch，理由記在 `tokens.css`；以出貨為準。）

**The Machine Voice Rule.** 等寬字只給機器說過或量過的東西：指令、標籤、位元組數、修訂日期、狀態。它不是「技術感」的戲服；沒有機器在說話的地方就不要用它。

**The Hanging Head Rule.** H1–H3 橫跨 `margin / wide` 兩條軌道掛出文字欄之外，而不是靠放大來取得層級。

## Layout

版面是一個三面被板色框住的物件。頂部 `--band`（76px，行動版 60px）是滿版板色的頭帶；左側 `--spine`（40px，行動版 16px）是書背，上面兩個裝訂孔與一條旋轉書背標；右側 `--rail`（56px，行動版 26px）是書口標籤軌。中間是一張連續的內頁，內含固定寬 288px 的索引欄與閱讀欄，兩者之間的髮絲線畫在內頁上（`.leaf::after`）而不是索引欄上，所以它跑滿整頁而不是停在 sticky 欄結束的地方。

閱讀欄是一個 grid：`[margin] 132px [main] minmax(0, 75ch) [wide] minmax(0, 1fr)`，欄距 32px。內文只住 `main`；標題跨 `margin / wide`；表格與指令視窗跨 `margin / -1` 取整張紙的寬度——一行折行的 `curl` 是沒人能在執行前檢查的指令。

間距節奏是 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 的九階，加上四個結構常數（spine / rail / index / band），後者在 `design.ts` 與 `tokens.css` 各有一份同值定義。另有一個 `--field: 992px`，它不是尺寸偏好而是內容需求：一行 `curl | sudo bash` 攤平所需的寬度。

**斷點只有三個，而且都不是慣例值：**

- **1024px**：物件變窄但不消失。書背與書口變細（16 / 26px），書背標與標籤文字隱藏，索引欄變成從左側滑入的抽屜（`translateX(-102%)` → `0`，仍是兩格鉸鏈）。
- **1280px**：正文降成兩軌（`[margin] 132px [main] 1fr`），紙張取消最大寬度上限，改由元素自己守住 75ch；表格與指令視窗因此拿到整條寬軌。
- **1600px**（`WIDE`，定義在 `site/src/useMedia.ts`）：本頁目錄從索引欄底下搬到書口側的 204px 邊欄。這個值不是挑好看的——邊欄要價約 210px，而那非常接近一行 `curl | sudo bash` 需要的寬度，所以在此寬度以下目錄退回索引欄底下，把寬度留給指令。到了這個寬度，紙張改成 `grid-template-columns: minmax(0, var(--field)) 204px`：版面**封頂**在 992px 而不是隨視窗長大，目錄緊接其後，多出來的寬度落在**目錄的右側**、貼著書口。空白的內頁屬於書口，不屬於正文與它自己的目錄之間。

### Named Rules

**The Measure Rule.** 散文永遠不超過 75ch；表格與指令視窗永遠可以吃掉整張紙。判準是「這段東西是拿來讀的，還是拿來檢查後複製的」。

**The Fore-Edge Rule.** 只有在 1600px 以上，本頁目錄才移進書口邊欄，而且是緊貼在封頂的版面之後。任何時候都不能因此壓縮指令視窗的可視寬度；視窗再寬，多出來的寬度一律給書口，不給閱讀場。

**The Shipped-Value Rule.** `design.ts` 與 `tokens.css` 對同一個 token 必須寫同一個值，而且這件事由 `npm test` 強制。對比斷言量的是 `design.ts`，瀏覽器畫的是 `tokens.css`——兩者一旦分岔，所有斷言就是在驗證一個沒有出貨的值。這正好發生過一次（light `--ink-3` 在 `design.ts` 調暗以通過地板，`tokens.css` 留著舊值，腳本全綠而頁面出貨 4.34:1），所以現在 `check-contrast.mjs` 會逐一比對 ink 三級、danger 與 milk 的兩份定義，深色的兩份副本也各自比對。

**The Chrome-Only Rule.** 前端只擁有 chrome——產品名、標語、meta。頁面上所有散文都是 README.md 的逐位元組渲染，DESIGN.md 的任何規則都不得被理解成允許在 TSX 裡寫內容。

## Elevation & Depth

這個世界**沒有海拔**。沒有卡片堆疊、沒有 z 軸層級、沒有環境陰影。深度只有一種來源，而且是實體的：內頁懸在分頁板上方約一毫米，於是切邊有一道又短又硬的投影。其餘一切層次由髮絲線（`--rule`）、強分隔線（`--rule-strong`）與凹槽底色（`--recess`）表達。

整份樣式表只存在兩支陰影，其中一支只給書背的孔用內陰影。

### Shadow Vocabulary

- **Cut shadow**（`box-shadow: 7px 0 14px -9px rgba(22, 21, 15, 0.55), 2px 0 0 -1px rgba(22, 21, 15, 0.13)`；dark 為 `7px 0 16px -9px rgba(0,0,0,0.85), 2px 0 0 -1px rgba(0,0,0,0.6)`）：內頁切邊的投影。兩層都是實的：一層模糊的落影，一層 2px 的硬切邊線。只用在 `.leaf`。
- **Lift**（`box-shadow: 0 2px 10px -6px rgba(22, 21, 15, 0.5)`；dark 為 `0 2px 12px -6px rgba(0,0,0,0.8)`）：被切出書口的那片標籤，以及行動版滑出的索引抽屜。只在物件真的離開紙面時使用。
- **Hole**（`box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45)`）：書背上兩個裝訂孔的內陰影。

### Named Rules

**The No-Stack Rule.** 一張連續的內頁，永遠不是一疊卡片。需要區隔就畫線或留白；需要強調就換墨色或字重。加一層陰影去分隔內容，等於承認這不是一本手冊。

**The Printed-Not-Filled Rule.** 分頁板與內頁都不是純色填滿，而是色 + `--tooth` 紙紋，以 `multiply`（light）／`screen`（dark）混合。新增任何滿版板色的表面都要帶上同一張紙紋，否則它會從物件上掉出來。

## Shapes

形是**模切**出來的，不是圓潤的。圓角只有一個值：`--r: 2px`，用在指令視窗、搜尋欄、警示框、表格外框、標籤片與 focus ring。三個例外都有物理理由：索引色塊 1px（那是一個小方塊）、裝訂孔與 TOC 記號 50%（那是打出來的洞）、捲軸拇指 99px（那是瀏覽器表面）。

邊界一律 1px 實線，取自 `--rule` 或 `--rule-strong`。沒有雙線、沒有虛線、沒有外框發光。搜尋欄與指令視窗不是「有邊框的輸入框」，而是從內頁上挖穿到底下板色的窗：抬頭直接印板色，內容區用 `--recess` 的凹槽。

focus 是一枚打上去的定位記號，不是光暈：`outline: 2px solid var(--board-ink)`、`outline-offset: 2px`；站在板色上的元件改用 `--on-board`，站在紙上的改用 `--ink`。

## Components

### Band（頭帶）

- **Shape:** 滿版板色 + 紙紋，底部 1px `rgba(0,0,0,0.22)`，高 76px（行動版 60px），`position: fixed`。
- **內容:** 產品名（Archivo 800、1.375rem、全大寫、`-0.02em`）與標語（0.8125rem、`opacity: 0.82`，1024px 以下隱藏）。名稱由 manifest 讀自根 README 的 H1，是這個 shell 唯一擁有的文案。
- **工具鈕:** 38px 方格，`--r` 圓角，hover `rgba(0,0,0,0.16)`、active `rgba(0,0,0,0.26)`，過場 `--hinge`。

### Tab Rail（書口標籤）

- **Shape:** 每片標籤最小高 72px，`flexGrow` 等於該分類的頁數——書口按各分類實際佔多少手冊來分，而不是均分。
- **Color:** 每片都是自己分類的板色**滿版強度**，文字用 `inkOn()` 選出的墨；被沖淡的標籤是一個你隔著房間叫不出名字的分類。
- **States:** hover `margin-left: -8px`；開啟中 `-22px` 加 `--lift`、下緣線消失、標籤字重升到 700。分辨開啟與否的是**模切的階差**，不是顏色深淺。

### Index（索引欄）

- **Shape:** 288px 固定寬、sticky、可捲；搜尋欄再 sticky 在它自己的頂端。
- **分組列:** 10px 的分類色塊 + 全大寫 label + 一條延伸到底的髮絲線。
- **項目:** 0.8125rem，預設 `--ink-2`；hover 上 `--recess` 並轉為 `--ink`；`aria-current="page"` 時加 `--recess`、字重 600，並在左緣點亮 1px 的分類色。

### Search Field（搜尋窗）

- **Style:** `--recess` 底、1px `--rule`、`--r` 圓角、內距 8/12；輸入字用等寬 0.8125rem。
- **Focus:** `:focus-within` 時邊框與 `inset 0 0 0 1px` 皆換成 `--board-ink`，文字轉 `--ink`。沒有發光、沒有位移。

### Code Window（打孔指令窗）

全站最具代表性的元件。指令是唯一會跟著讀者離開網站的東西，所以它不是灰底方塊，而是把內頁挖穿到板色。

- **抬頭:** 滿版 `--board`，`--on-board` 文字；左側語言名（label 級），右側複製鈕（label 級，hover `rgba(0,0,0,0.2)`、active `0.32`）。
- **`sudo` 標記:** 指令字串裡含 `sudo` 時，抬頭出現一枚朱紅填色的等寬標記。這是對指令自身文字的事實陳述，不是評價。
- **內容:** `--recess` 底，等寬 0.8125rem / 1.7，橫向可捲。
- **語法著色只有三種墨:** 機器執行的東西用 `--ink` 加粗；被交代去執行的東西用 `--board-ink`；註解、標點、運算子退到 `--ink-3`；字串用 `--ink-2`。`prefers-contrast: more` 時 `--board-ink` 的那一組退回 `--ink`。指令要讀起來像一條可信的字串，不是一盤水果沙拉。

### Provenance Strip（來源列）

每頁頂端、獨立一條 `--rule-strong` 線上的等寬條：SOURCE 檔名、BYTES 位元組數、REV 修訂日期與天數，右端是 GitHub 連結。這是全站唯一競爭者無法照抄的一句話，所以它在頁首而不在頁尾。頁面過期時，天數轉為 `--ink` 並以 `--danger-ink` 加註，**同時**內頁泛黃——狀態同時有字面與材質兩種載體。

### Margin TOC（書口目錄）

- **Style:** 0.8125rem，`--ink-3`；H3 再縮排 24px、降到 0.75rem。
- **States（記號，不是色相）:** 尚未讀到＝空心圓圈（1px `--ink-3` 描邊）；已讀過＝一道 135° 的摺痕（方形，線性漸層切出的斜線）；當前＝實心打孔（`--board` 填色、`--board-ink` 描邊，外加 2px `--leaf` 的間隙環）。三者是不同的**形狀**，把顏色抽掉仍然讀得出來。

### Alerts（GitHub alert）

- **Style:** `--recess` 底、1px `--rule-strong`、`--r` 圓角，label 級的全大寫標題。
- **Danger:** 邊框換 `--danger`、底換 `--danger-field`、標題換 `--danger-ink`。這是朱紅在正文裡唯一的出場。

### Icons

八支圖示全部手繪在 `site/src/components/Icons.tsx`：20 的框、1.5 的線寬、`currentColor` 描邊、無填色（GitHub 標誌除外，它是商標必須是它自己）。沒有圖示字型、沒有圖示套件、沒有 emoji 當 UI 圖示。

### Motion

**The Two-Frame Hinge Rule.** 全站只有一種動態文法：`--hinge: 90ms steps(2, end)`。沒有任何 easing、沒有任何 fade、沒有 `scroll-behavior: smooth`（改用 `scroll-padding-top` 讓錨點正確落在標題上）。簽名動作是換頁時內頁沿打孔邊翻起的兩格鉸鏈（`perspective(1400px) rotateY(-1.6deg)` → `none`），並在 `prefers-reduced-motion: reduce` 下完全關閉。

### Ageing

`revisionOf()` 讀每頁自己的 `> 最後更新：YYYY-MM-DD`，換算成三階材質：0 新鮮、1 泛黃（≥ 90 天）、2 褪白（≥ 270 天），以 `--age-N` 的色層疊在解出的閱讀區之上——疊加，不是取代，所以泛黃的內頁仍然守住它的亮度帶。閾值對應這些 runbook 釘住的 Kubernetes 與 Supabase 版本的實際失效期，不是為了截圖好看。這個狀態只花在材質與來源列的記號上，**永遠不會變成新的散文**。

## Do's and Don'ts

### Do:

- **Do** 讓新的顏色語意經過 `design.ts` 的解算函式（`solveLeaf()`、`readableOn()`、`inkOn()`、`printable()`），而不是新增手調色票。
- **Do** 為新增的分類只做一件事：新增一個頂層資料夾。色相、標籤、書口高度都會自己長出來。
- **Do** 在改動色相、亮度帶或墨色之後跑 `npm test`；`scripts/check-contrast.mjs` 是這套系統唯一的對比裁判。
- **Do** 用 `--hinge` 當所有過場的唯一值，並為每個動態補上 `prefers-reduced-motion: reduce` 的關閉分支。
- **Do** 讓散文守住 75ch，讓表格與指令視窗跨 `margin / -1` 取整張紙寬。
- **Do** 用記號（形狀）表達狀態，並在顏色之外另給一個字面載體。
- **Do** 給任何滿版板色的新表面疊上 `--tooth` 紙紋與對應的 `background-blend-mode`。
- **Do** 需要新圖示時照 20 框 / 1.5 線寬 / 無填色的規格手繪一支。

### Don't:

- **Don't** 在 CSS 裡硬寫 `--board`、`--leaf`、`--on-board`、`--board-ink` 或 `--danger-ink` 的值；`base.css` 那組僅是首次繪製前的回退。
- **Don't** 把任何分類名稱綁到特定色相；指派永遠按位置。
- **Don't** 把朱紅用在危險以外的任何地方——不當品牌色、不當強調色、不當 hover 色、不當第八個分類色。
- **Don't** 加入 easing、fade、`transition: all`、`scroll-behavior: smooth` 或任何超過兩格的動畫。
- **Don't** 用陰影或卡片堆疊來分隔內容；除了 `--cut-shadow`、`--lift` 與裝訂孔的內陰影之外，這個世界沒有第四支陰影。
- **Don't** 加入漸層裝飾、毛玻璃、藥丸圓角或 `--r`（2px）以外的圓角——三個有物理理由的例外除外。
- **Don't** 為標題引入第二套字級；層級由字重、Archivo 的寬度軸與掛出邊界承擔。
- **Don't** 只用顏色表達狀態。
- **Don't** 引入圖示字型、圖示套件，或拿 emoji 當介面圖示。
- **Don't** 引入第四支字族，也不要讓 `system-ui` / Georgia 從回退位置升格成實際使用的顯示字體。
- **Don't** 在 TSX 或 HTML 裡寫任何頁面散文；那是 README.md 的工作，這條是產品層級的硬約束。
