---
name: figma-structure-check
description: Figmaデザインが「AIエージェントに渡せる状態」になっているかを構造的に検査し、デザイナーに修正リストを返すSkill。デザイン納品前のセルフチェックとして、またはコーディング着手前のゲートとして利用する。
---

# Figma構造チェック Skill

## このSkillの目的

Figma のデザインを Claude Code に渡してコーディングさせる前に、「AI が正しく読める状態か」を**機械的にチェック**するSkillです。検査に通らないデザインは再現率が必ず下がるため、デザイナーへ差し戻すための明確な根拠を返します。

## 使い所

- **デザイナー納品前のセルフチェック**：デザイナー自身が実行し、警告を直してから納品
- **ディレクター承認のゲート**：デザイン承認の前にこのチェックをPASSすることを必須にする
- **コーディング着手前のチェック**：Claude Code がコーディングを始める前に自動実行し、致命的な不備があれば差し戻す

## 入力

以下の情報が必要です。ユーザーから取得できない場合は質問してください。

- `FIGMA_TOKEN`（環境変数。設定済みであれば不要）
- `FIGMA_FILE_KEY`（FigmaファイルURLの `/file/<ここ>/...` 部分）
- `nodeId`（オプション。特定のページ/Frameだけチェックする場合）

## 実行手順

1. `scripts/check-figma.js` を実行する：

   ```bash
   FIGMA_FILE_KEY=xxxxxxxxxxxx node scripts/check-figma.js
   # 特定のページだけ:
   FIGMA_FILE_KEY=xxxxxxxxxxxx node scripts/check-figma.js --node 1:23
   ```

2. 標準出力に JSON レポートが出る。`--report` オプションでMarkdownレポートを生成:

   ```bash
   FIGMA_FILE_KEY=xxxxxxxxxxxx node scripts/check-figma.js --report > figma-check-report.md
   ```

3. JSON または Markdown のレポートを読み、検出された違反をユーザー（デザイナー or ディレクター）に分かりやすく要約する。

## チェック項目（rules/check-rules.json で定義）

以下の項目を順に検査します。詳細ルールは `rules/check-rules.json` を参照してください。

1. **Auto Layout の使用**：すべての FRAME / GROUP が Auto Layout を使っているか。手動配置は禁止。
2. **Variables（デザイントークン）の使用**：色・フォントサイズ・フォントファミリー・spacingが Variables にバインドされているか。直値（hex直書き等）を検出。
3. **Components 化**：3回以上同一構造で繰り返されている要素が Component 化されているか。
4. **レイヤー命名規約**：kebab-case、意味のある名前、デフォルト名（"Rectangle 5"等）の禁止。
5. **レスポンシブ Frame の存在**：同一機能の PC / SP（最低2種）Frame があるか。
6. **画像マーキング**：画像書き出し対象レイヤーに `@img-` プレフィックスがついているか。
7. **CMS可変領域マーキング**：CMSで編集する領域に `@cms-` プレフィックスがついているか。
8. **アクセシビリティアノテーション**：画像レイヤーに代替テキストの Description が設定されているか。
9. **再現困難パターン**：CSS で再現困難な効果（複雑なマスク、特殊ブラー等）の検出と警告。

## 出力形式

### JSON（機械可読・Claude Codeのループ判定用）

```json
{
  "fileKey": "xxx",
  "checkedAt": "2026-05-16T12:00:00Z",
  "summary": {
    "totalNodes": 234,
    "errors": 12,
    "warnings": 34,
    "passed": false
  },
  "violations": [
    {
      "severity": "error",
      "rule": "auto-layout",
      "nodeId": "1:45",
      "nodeName": "Section / Hero",
      "message": "FRAMEがAuto Layoutを使用していません",
      "fix": "Frameを選択し、Shift+A で Auto Layout を適用してください"
    }
  ]
}
```

### Markdown レポート（人間用）

`scripts/check-figma.js --report` で出力される `figma-check-report.md` は、`examples/report-sample.md` の形式に従います。デザイナーが直すべき項目を**優先順位順、ノードへのジャンプリンク付き**で表示します。

## 結果の活用

- **errors が 1件でもあれば** Visual Diff ループには進まず、デザイナーに差し戻す
- **warnings は許容可能だが**、再現率が伸びない場合はここを疑う
- レポート末尾の「修正提案」を、そのままデザイナーへの依頼文として使える

## このSkillが「やらないこと」

- デザインの良し悪し（UX/UI評価）の判定はしない
- ブランドガイドライン適合チェックはしない（別Skillで扱う）
- 配色のコントラスト比チェックは axe-core 側で実装（このSkillの責任範囲外）
