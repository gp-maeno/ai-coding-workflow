---
name: workflow-improvement
description: ワークフローを「使うほど賢くなる」自己改善ループを提供するSkill。案件完了時にClaude Code自身が retrospective.md を生成し、蓄積された振り返りからチェックルールの更新提案を自動生成、ダッシュボードでメトリクスを可視化する。
---

# Workflow Improvement Skill

## このSkillの目的

ワークフローを「使うほど精度が上がる」ように、3つの仕組みを提供します。

1. **AI による振り返り自動生成**：案件完了時に Claude Code が retrospective.md を生成する
2. **ルール更新提案**：蓄積された retrospective を集約し、`check-rules.json` への更新案を自動で生成する
3. **ダッシュボード**：案件横断のメトリクスを可視化する

これらを継続的に回すことで、Figma構造チェックや Visual Diff の精度が、案件をこなすたびに向上していきます。

## 使う場面

- **案件完了時**：Claude Code が `generate-retrospective.js` で振り返りを生成 → コーダーが最小限の補完
- **月次レビュー**：管理者が `propose-rule-updates.js` を実行してルール更新案を生成 → 人が承認
- **常時参照**：ダッシュボードを開いて全体傾向を把握

## 入力と出力の全体像

```
[Visual Diff Loop の出力]
   report/diff.json (再現率、差分情報)
   report/iterations.log (反復履歴)
        │
        ▼
[generate-retrospective.js]    ← AI が自動生成
   retrospectives/{yyyymm}-{案件名}.md
        │
   コーダーが補完（最小限）
        │
        ▼
[retrospectives/ に蓄積]
        │
        ▼
[propose-rule-updates.js]      ← 月次で集約
   rule-update-proposals/{yyyymm}.md
        │
   人が承認 → check-rules.json 反映
        │
        ▼
[dashboard.js]                 ← 常時可視化
   dashboard.html
```

## 3つのスクリプト

### 1. generate-retrospective.js

**実行タイミング**：Visual Diff ループが PASS した直後、または FAIL で 5回反復しても閾値に届かなかった時。

**実行方法**：
```bash
node skills/workflow-improvement/scripts/generate-retrospective.js \
  --project "○○高校コーポレートサイト" \
  --diff-report ./report/diff.json \
  --spec ./docs/spec.md \
  --out ./retrospectives/202605-osaka-koukou.md
```

**生成される内容**（templates/retrospective.md.template に準拠）:
- Frontmatter（再現率、反復回数、業種、CMS、日付）
- 概要
- メトリクス（自動）
- うまく行ったこと（自動推論）
- 苦戦したこと（差分が大きかった領域から自動抽出）
- 教訓と次回への申し送り（AIが推論、コーダーが追記）
- ルール改善提案（任意、AIが気づいたら記入）
- コーダー追記欄

**コーダーの作業**：所要時間 5〜10分程度の追記のみ。空欄の `[CODER NOTE]` セクションを埋める。

### 2. propose-rule-updates.js

**実行タイミング**：月次レビュー会の前（または案件3件溜まったタイミング）。

**実行方法**：
```bash
node skills/workflow-improvement/scripts/propose-rule-updates.js \
  --retrospectives ./retrospectives/ \
  --rules ./skills/figma-structure-check/rules/check-rules.json \
  --out ./rule-update-proposals/202605.md
```

**生成される内容**：
- 全 retrospective のメトリクス集約サマリー
- 頻出する苦戦パターンランキング
- 既存ルールでカバーできていない問題の検出
- 既存ルールの severity 調整提案（誤検出が多ければ下げる、見逃しが多ければ上げる）
- 具体的な `check-rules.json` への差分パッチ（Markdown diff として記載）

**人の作業**：提案を読み、採用するものを `check-rules.json` に反映。

### 3. dashboard.js

**実行タイミング**：随時。

**実行方法**：
```bash
node skills/workflow-improvement/scripts/dashboard.js \
  --retrospectives ./retrospectives/ \
  --out ./dashboard.html
```

**表示内容**：
- 案件別の再現率推移グラフ
- 反復回数の分布
- 業界別の傾向（医療系、学校系、コーポレート系）
- 頻出する「苦戦パターン」ランキング
- 全体KPI（平均再現率、平均反復回数、平均所要日数）

## このSkillの設計判断

**「AIが書き、人が補完する」二段構え**。AI に完全自動で書かせるとパターンが固定化して洞察が薄くなり、人に完全自動で書かせると負担が大きくて書かれなくなる。両者のハイブリッドが現実的に続けられる形です。

**ルール変更は人の承認を経由**。AI の提案を直接 `check-rules.json` に書き込むことはしません。誤った提案が混入するとシステム全体が壊れるため、必ず人のレビューを挟みます。

**振り返りは frontmatter で構造化**。後段の集約スクリプトが機械的に処理できるよう、メタデータは frontmatter に、自由記述は本文に、と分離しています。

## このSkillが「やらないこと」

- 自動でのルール変更（必ず人の承認）
- 個人パフォーマンス評価（チームの改善が目的、個人の優劣付けはしない）
- 顧客情報の蓄積（retrospective には顧客固有の機密情報を書かない）
