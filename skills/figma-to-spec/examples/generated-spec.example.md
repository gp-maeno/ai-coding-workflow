# 中間仕様（spec.md） — 案件名: ○○高校コーポレートサイト

<!-- 自動生成 by figma-to-spec Skill at 2026-05-16T13:24:00Z -->
<!-- Figma File: abc123XYZdef -->

---

## 案件概要

- **顧客名**: [TODO] 顧客名を記入
- **業種**: [TODO] 学校法人 / 医療機関 / その他
- **ターゲット**: [TODO] 想定読者（年齢、属性、行動）
- **Figma URL**: https://www.figma.com/file/abc123XYZdef/
- **CMS**: [TODO] WOW3社内CMS / WordPress / なし
- **公開URL**: [TODO]
- **業界制約**: [TODO] 薬機法 / 教育機関 / 個人情報 など

## デザインシステム（Variables）

| トークン名 | 型 | 値 (default) | 用途 |
|---|---|---|---|
| `--color-primary` | COLOR | #0066CC | プライマリカラー |
| `--color-secondary` | COLOR | #FF8800 | アクセントカラー |
| `--color-text` | COLOR | #222222 | 本文テキスト |
| `--color-text-light` | COLOR | #666666 | 補助テキスト |
| `--color-bg` | COLOR | #FFFFFF | 背景 |
| `--color-bg-section` | COLOR | #F5F5F5 | セクション背景 |
| `--font-size-body` | FLOAT | 16 | 本文 |
| `--font-size-h1` | FLOAT | 36 | 見出し1 |
| `--font-size-h2` | FLOAT | 28 | 見出し2 |
| `--spacing-section` | FLOAT | 96 | セクション間 |
| `--spacing-card` | FLOAT | 32 | カード内 padding |

## ページ・セクション構成

### トップページ / pc

| ID | セクション名 | サイズ | ノードID |
|---|---|---|---|
| `hero` | hero | 1440×640 | `1:23` |
| `news` | news / 新着情報 | 1440×320 | `1:34` |
| `feature` | feature / 特長 | 1440×560 | `1:45` |
| `philosophy` | philosophy / 教育理念 | 1440×480 | `1:56` |
| `cta` | cta / 資料請求 | 1440×280 | `1:78` |
| `footer` | footer | 1440×360 | `1:89` |

### トップページ / sp

| ID | セクション名 | サイズ | ノードID |
|---|---|---|---|
| `hero` | hero | 375×560 | `2:23` |
| `news` | news / 新着情報 | 375×400 | `2:34` |
| `feature` | feature / 特長 | 375×720 | `2:45` |
| `philosophy` | philosophy / 教育理念 | 375×640 | `2:56` |
| `cta` | cta / 資料請求 | 375×240 | `2:78` |
| `footer` | footer | 375×480 | `2:89` |

## レスポンシブ仕様

- PC: 1440px 設計
- SP: 375px 設計

[TODO] Breakpoint境界値、コンテナ最大幅、グリッド変化の詳細を記入

## アクセシビリティ要件

- WCAG 2.1 AA 準拠
- すべての画像に alt 属性
- 見出しは h1 → h2 → h3 と階層をスキップしない
- フォーカスインジケーターを必ず可視化
- コントラスト比 4.5:1 以上

### 画像のalt属性

| ノード名 | alt候補 | ノードID |
|---|---|---|
| @img-hero-bg alt:校舎正面の外観写真 | 校舎正面の外観写真 | `1:25` |
| @img-feature-icon-1 @deco | (装飾画像 — alt="") | `1:46` |
| @img-philosophy-photo alt:授業風景 | 授業風景 | `1:58` |
| @img-cta-illust | [TODO] | `1:80` |

## インタラクション仕様

[TODO] Figma上のPrototype指定があれば記入、なければ以下を埋める

| 要素 | 動作 | 備考 |
|---|---|---|
| グローバルナビ | ホバーで下線アニメ | 0.2s ease-out |
| カード | ホバーで影が深くなる | transform translateY(-1px) |
| CTA ボタン | ホバーで色暗化 | filter: brightness(0.9) |

## CMS可変領域

| フィールド名 | 入力タイプ | 最大文字数 | ノードID |
|---|---|---|---|
| hero-title | text | [TODO] | `1:24` |
| hero-subtitle | textarea | [TODO] | `1:26` |
| news-list | repeater | [TODO] | `1:35` |
| feature-card | repeater | [TODO] | `1:47` |
| philosophy-body | textarea | [TODO] | `1:57` |

## 画像書き出し対象

| ファイル名 | 形式 | ノードID |
|---|---|---|
| hero-bg.png | PNG | `1:25` |
| feature-icon-1.svg | SVG | `1:46` |
| feature-icon-2.svg | SVG | `1:47` |
| feature-icon-3.svg | SVG | `1:48` |
| philosophy-photo.png | PNG | `1:58` |
| cta-illust.svg | SVG | `1:80` |

## 再現困難パターン（自動検出）

- **hero-glow** (`1:27`): 強いBACKGROUND_BLUR (radius=48) — backdrop-filter で近似
- **section-overlay** (`1:56`): 非標準blend-mode "MULTIPLY" — mix-blend-mode で近似

[TODO] 各項目について、(a) 完全再現を試みる, (b) 代替表現に置き換える, (c) デザイナーに差し戻す のいずれかを決定してください。

## 検収基準

- **Visual Diff 再現率**: 全ターゲット 95% 以上、重要領域（hero / cta）は 97% 以上
- **WCAG 2.1 AA**: axe-core のエラー0件
- **Lighthouse スコア**: Performance 90+, Accessibility 100, SEO 100
- [TODO] 案件固有の検収基準があれば追記
