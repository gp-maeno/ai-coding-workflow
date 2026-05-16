---
name: figma-to-spec
description: Figmaデザインから中間仕様（spec.md）を自動生成するSkill。Phase 1の主要コンポーネント。Figma Color/Text Styles（Professional プラン対応）、Frame構造、@cms-/@img- マーカー、レイヤーDescriptionから情報を抽出し、Claude Codeがコーディングに使える構造化された仕様書を出力する。Enterprise プランの場合は `--with-variables` で Variables API も併用可能。
---

# 中間仕様生成 Skill（figma-to-spec）

## このSkillの目的

Figma デザインを Claude Code に渡す前に、**コーディングに必要な情報を構造化された Markdown（spec.md）に書き出す**Skillです。デザインが「絵」のままだとAIは細かい仕様を読み違えますが、中間仕様として文書化することで、後段の Visual Diff ループの精度が大きく上がります。

## 使う場面

- Figma 構造チェック Skill（figma-structure-check）が PASS した後
- コーディング着手前
- ディレクターが spec.md を仕上げる際の**叩き台**として（完全自動ではなく、人の補完前提）

## 入力

- `FIGMA_TOKEN`（環境変数）
- `FIGMA_FILE_KEY`（環境変数）
- `--node <nodeId>` （オプション、特定ページのみ処理する場合）
- `--out <path>`（オプション、デフォルト `docs/spec.md`）
- `--project-name <name>`（オプション、案件名）
- `--with-variables`（オプション、**Enterprise プランのみ**）：Figma Variables API を叩いてデザイントークンを抽出。未指定時は Color/Text Styles から抽出する

## 実行手順

1. `scripts/generate-spec.js` を実行する：

   ```bash
   FIGMA_FILE_KEY=xxx node scripts/generate-spec.js \
     --node 0:1 \
     --out docs/spec.md \
     --project-name "○○高校コーポレートサイト"
   ```

2. 出力された `docs/spec.md` を確認する。**`[TODO]` マーカーが残っている箇所**は人が補完する必要がある（顧客情報、ターゲット、業界制約など）。

3. ディレクターが必要事項を埋め、デザイナー/ディレクターでレビューしてから Claude Code に渡す。

## このSkillが自動で埋める情報

- **デザインシステム**：Figma Color Styles / Text Styles → CSS Custom Properties 候補として書き出し（`--with-variables` 指定時のみ Enterprise の Variables API も併用）
- **ページ構成**：Frame ツリーから抽出（pc/sp ペアを認識）
- **セクション一覧**：各ページ直下の Frame をセクションとして列挙、ノードIDを併記
- **CMS可変領域**：`@cms-` プレフィックスのレイヤーを検出し、フィールド名・想定入力タイプを推定
- **画像書き出し対象**：`@img-` プレフィックスのレイヤーを検出
- **アクセシビリティ情報**：画像レイヤーの Description（または `alt:` を含むレイヤー名）から alt 候補を抽出
- **再現困難パターン**：強いブラー、複雑なblend-mode等を検出し、警告として記録

## このSkillが人に求める情報（[TODO] マーカー）

- 顧客名、業種、ターゲットユーザー
- 業界制約（医療なら薬機法、学校なら教育委員会対応など）
- 公開URL
- 検収基準（再現率閾値、Lighthouseスコア目標）
- インタラクション仕様（ホバー、スクロール連動などFigma上では表現困難なもの）
- 「再現困難パターン」検出時の対応方針（差し戻し or 代替実装）

## 出力フォーマット

`templates/spec-template.md` の構造に基づきます。サンプルは `examples/generated-spec.example.md` を参照。

## 設計判断

**「完全自動」を目指さない**。Figma から取れる情報には限界があり、特に顧客背景・業界制約・検収基準などは人が決めるべきものです。このSkillは「機械的に取れるものは取り尽くす」「人が判断すべき箇所は明示的に [TODO] で残す」という二段構えで、ディレクターの作業を半分以下に減らすことを目指します。

**`@cms-` マーカーを尊重**。CMS可変領域の検出は「デザイナーがマーキングしてある」前提です。マーキングが甘い場合は figma-structure-check Skill の `cms-marker` ルールを有効化して事前チェックしてください。

## このSkillが「やらないこと」

- 顧客情報の収集（人が記入）
- 見積もり生成（別Skillで扱う）
- コーディング自体（Claude Code 本体の仕事）
- インタラクションの自動仕様化（Figma Prototype を読む拡張は将来検討）
