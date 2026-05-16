# 中間仕様（spec.md） — 案件名: {{PROJECT_NAME}}

<!-- 自動生成 by figma-to-spec Skill at {{GENERATED_AT}} -->
<!-- Figma File: {{FIGMA_FILE_KEY}} -->

---

## 案件概要

- **顧客名**: [TODO] 顧客名を記入
- **業種**: [TODO] 学校法人 / 医療機関 / その他
- **ターゲット**: [TODO] 想定読者（年齢、属性、行動）
- **Figma URL**: https://www.figma.com/file/{{FIGMA_FILE_KEY}}/
- **CMS**: [TODO] WOW3社内CMS / WordPress / なし
- **公開URL**: [TODO]
- **業界制約**: [TODO] 薬機法 / 教育機関 / 個人情報 など

## デザインシステム（Variables）

{{DESIGN_TOKENS_TABLE}}

## ページ・セクション構成

{{PAGES_AND_SECTIONS}}

## レスポンシブ仕様

{{RESPONSIVE_SECTION}}

## アクセシビリティ要件

- WCAG 2.1 AA 準拠
- すべての画像に alt 属性
- 見出しは h1 → h2 → h3 と階層をスキップしない
- フォーカスインジケーターを必ず可視化
- コントラスト比 4.5:1 以上

{{A11Y_TABLE}}

## インタラクション仕様

[TODO] Figma上のPrototype指定があれば記入、なければ以下を埋める

| 要素 | 動作 | 備考 |
|---|---|---|
| グローバルナビ | ホバーで下線アニメ | 0.2s ease-out |
| カード | ホバーで影が深くなる | transform translateY(-1px) |
| CTA ボタン | ホバーで色暗化 | filter: brightness(0.9) |

## CMS可変領域

{{CMS_AREAS_TABLE}}

## 画像書き出し対象

{{IMAGE_EXPORT_TABLE}}

## 再現困難パターン（自動検出）

{{HARD_TO_REPRODUCE_LIST}}

## 検収基準

- **Visual Diff 再現率**: 全ターゲット 95% 以上、重要領域（hero / cta）は 97% 以上
- **WCAG 2.1 AA**: axe-core のエラー0件
- **Lighthouse スコア**: Performance 90+, Accessibility 100, SEO 100
- [TODO] 案件固有の検収基準があれば追記
