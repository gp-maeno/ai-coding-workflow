# Claude Code 向け作業指示書（Visual Diffループ）

このファイルは Claude Code が起動時に自動で読みます。あなた（Claude Code）はこの指示に従って、Figma デザインを高再現率で静的HTMLに落とし込んでください。

## あなたのゴール

`docs/spec.md`（中間仕様）と `targets.json`（比較対象定義）と Figma MCP に基づき、`src/` にデザインの**再現率 95% 以上**の静的HTML/CSS/JSを生成してください。

「再現率 95%」とは、`npm run diff` を実行したときの `report/diff.json` の `pass` が `true`、かつ全ターゲットが個別閾値を超えることを指します。

## 作業ループ（必ずこの順番で）

1. **Read first**: `docs/spec.md` を読む。次に `scripts/targets.json` を読む。Figma URL とコンポーネント構成を把握する。

2. **Reference fetch**: `npm run fetch-figma` を実行し、Figmaから正解画像を取得する。

3. **Initial generate**: `src/` に静的HTML/CSS/JSを生成する。以下を守ること:
   - 社内のコーディングルール（別途 Skill で提供）に従う
   - `targets.json` の各 `id` に対応する `#id` アンカーを必ず付ける
   - WCAG 2.1 AA を最初から考慮（alt、見出し階層、ランドマーク、コントラスト）
   - CSS Variables にデザイントークンを集約

4. **Local serve**: `npx serve src -p 3000` を起動する（バックグラウンド）。

5. **Diff loop（核心）**: 以下を最大5回まで繰り返す:
   1. `npm run render` で生成HTMLをスクショ
   2. `npm run diff` で比較。`report/diff.json` を読む。
   3. `pass: true` なら**完了**。ループを抜ける。
   4. `pass: false` なら、`results` 配列の中で `pass: false` のものを優先順に処理:
      - `diffImage` を読み込む（赤い部分が差分）
      - `referenceImage` と `renderImage` を見比べる
      - 該当セクションの `src/` のHTML/CSSを修正する
      - 直したらループの先頭に戻る

6. **完了報告**: 最終 `overallScore` と、各ターゲットのスコアを箇条書きで報告する。閾値を超えられなかったターゲットがあれば、理由（フォント描画限界、Figmaに再現不能な指定等）を明記する。

7. **振り返りの自動生成（重要）**: ループ終了後（PASS/FAILどちらでも）、必ず以下を実行する:

   ```bash
   node skills/workflow-improvement/scripts/generate-retrospective.js \
     --project "<案件名>" \
     --diff-report ./report/diff.json \
     --spec ./docs/spec.md \
     --structure-check ./report/structure-check.json \
     --duration <分単位の所要時間> \
     --iterations <実際の反復回数> \
     --out ./retrospectives/$(date +%Y%m)-<slug>.md
   ```

   その後、生成された retrospective.md を開き、`[AI が補完]` マーカーが付いた以下のセクションを埋める:

   - `## 概要` — 案件規模、構成、結果を2-3文で要約
   - `## うまく行ったこと` — 高再現率を達成した箇所、効いた工夫を3-5項目
   - `## 苦戦したこと` — 差分が大きかった箇所、なぜ難しかったか、どう対処したか
   - `## 教訓と次回への申し送り` — 次回類似案件で活かしたい教訓を3-5項目
   - `## ルール改善提案` — 構造チェックルールに追加・調整すべき気づき（なければ「なし」）

   `[CODER NOTE]` セクションには何も書かない。コーダーが後で記入する。

## 修正のコツ（過去の傾向から）

- **レイアウトのズレ**：Auto Layout の gap、padding を CSS で flex の gap / padding に正確に対応させる
- **フォントの差**：Figmaで使われているフォントウェイト・サイズを CSS 側で完全一致させる。letter-spacing、line-height も忘れず
- **色の差**：`#xxxxxx` を直書きせず、`var(--color-xxx)` で参照。トークンとずれていないか確認
- **影・グラデーション**：Figmaの数値を box-shadow / linear-gradient にそのまま再現
- **画像サイズの差**：object-fit、aspect-ratio を活用
- **アンチエイリアスのわずかな差**：3%以下なら無視してよい。それ以上なら根本問題あり

## やってはいけないこと

- 閾値に届かないまま `pass: false` を放置して完了報告
- `report/diff.json` を確認せずに「できました」と言う
- 自己修正で 5回を超えて反復する（無限ループ防止）
- Figma にない要素を勝手に追加する（spec.md か Figma にあるものだけ実装する）
- アクセシビリティ要件をスキップして再現率だけ追う

## トラブルシューティング

- **`npm run fetch-figma` が失敗**：`FIGMA_TOKEN` と `FIGMA_FILE_KEY` が環境変数に設定されているか確認
- **`npm run render` で要素が見つからない**：`targets.json` の `renderUrl` のハッシュ（`#hero` 等）と `src/` 内のidが対応しているか確認
- **再現率がどうしても上がらない**：`spec.md` の「再現困難パターン」セクションを更新し、デザイナーへの差し戻し提案を報告に含める

## このループで「やらないこと」

- インタラクション（ホバー、スクロール連動）の検証 — 別途手動確認
- パフォーマンス最適化 — `verify.sh` で Lighthouse 実行（このループとは別フェーズ）
- バックエンド組み込み — フロント完了後にバックエンドエンジニアが担当
