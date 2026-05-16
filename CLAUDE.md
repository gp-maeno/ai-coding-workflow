# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリの位置づけ

ウェブ制作会社向けに「Figma → Claude Code → 高再現率コーディング」の最適ワークフローを設計・検証するための**プロトタイプ／提案リポジトリ**。プロダクションコードではなく、提案資料（`proposal.html`, `manual.html`）と参照実装（`visual-diff-loop/`, `skills/`）で構成される。

## ディレクトリ構成と役割

- `proposal.html` / `manual.html` — クライアント・社内向けの提案・マニュアル（静的HTML、直接編集）
- `skills/` — Claude Code 用 Skill 群。各サブディレクトリに `SKILL.md`（YAML frontmatter 必須）
  - `figma-structure-check/` — Figma が AI 渡せる構造かを機械的に検査
  - `figma-to-spec/` — Figma から中間仕様 `spec.md` を生成
  - `workflow-improvement/` — 案件完了後の retrospective と自己改善ループ
- `visual-diff-loop/` — Figma 正解画像と生成HTMLのピクセル差分を回す独立Node.jsプロジェクト。**作業時は `visual-diff-loop/CLAUDE.md` を優先**して読むこと

## 作業の基本フロー

ワークフロー全体図と各フェーズ詳細は **`manual.html` の `#overview` セクション**（「ワークフロー全体図」）に一枚絵で書かれている。重複を避けるため、フローを参照したいときはまずそちらを開くこと。提案ストーリーは `proposal.html` 側にある。

概略のみ:
1. `figma-structure-check` → 2. `figma-to-spec` → 3. `visual-diff-loop` → 4. `workflow-improvement`

## 変更時の必須チェック：提案資料の同期

`proposal.html` と `manual.html` は **コードと並ぶ「成果物」**。以下の種類の変更を入れたときは、これら2ファイルの該当箇所が陳腐化していないか必ず確認し、必要なら同時に修正する:

- Skill の追加・削除・責務変更（`skills/*/SKILL.md` の `description` 変更を含む）
- ワークフローのフェーズ順序・コマンド・閾値の変更
- `visual-diff-loop/` のスクリプト追加・コマンド名変更（`package.json` の `scripts`）
- `check-rules.json` の構造変更
- 案件ディレクトリ構造や中央リポジトリ構造の変更

確認手順：変更後に `manual.html` を全文検索し、変更したコマンド名・Skill名・ファイルパスがヒットしたら、その箇所の説明が新しい挙動と一致するかをチェック。`proposal.html` は提案上の位置づけが変わっていないかを目視確認。

不要な修正は入れないが、**「コード変更したのに資料は古いまま」を放置しない**。

## コーディング規約

- ドキュメント・コメントは**日本語**。ただし変数名・関数名・スクリプト名は英語
- スクリプトは Node.js（CommonJS or ESM は既存ファイルに合わせる）
- 新規 Skill を追加する場合は `skills/<skill-name>/SKILL.md` に frontmatter (`name`, `description`) を必ず含める
- 提案系HTML（`proposal.html`, `manual.html`）はそのまま手で読まれる単一ファイル。ビルドツール無し

## 触らない／勝手に追加しないもの

- `visual-diff-loop/references/`, `renders/`, `report/`, `retrospectives/` は自動生成物。手書きしない
- ビルド設定や lint 設定はあえて入れていない。導入提案はしてよいが勝手に追加しない
- 既存3つのSkillの責務分割は意図的。機能をまたぐ変更は事前に提案する

## サブディレクトリで作業するとき

`visual-diff-loop/` 内での作業は、そこの `CLAUDE.md` と `README.md` を読んでから着手する。差分ループの実行手順・閾値・修正コツがそちらに書かれている。
