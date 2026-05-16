# Visual Diff Loop — Figma 再現率を上げるためのClaude Code連携

このディレクトリは、Figma デザインと Claude Code が生成した静的HTML/CSS/JS の**ビジュアル差分を自動測定し、再現率が閾値を超えるまでAIが自己修正するループ**の雛形です。

## なぜ作るのか

Figma MCP を通じて Claude Code にコーディングさせると、「だいたい合っているがピクセル単位で見ると違う」状態で生成が止まります。これは AI 側に「正解と比較する目」がないためです。

このループでは:

1. Figma から **正解画像** を書き出す
2. 生成された HTML を **Playwright で同条件のスクショ** にする
3. **ピクセル単位で比較**して差分スコアを出す
4. スコアが閾値未満なら Claude Code に差分情報を返し**自己修正**させる
5. 閾値を超えるか上限回数まで反復

これにより、人が「ここが違う」と毎回指摘する作業を AI ループの中に組み込みます。

## アーキテクチャ全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                       Claude Code 主導ループ                      │
└─────────────────────────────────────────────────────────────────┘

[Figma]                                       [生成された HTML]
   │                                                 │
   │ fetch-figma.js                       render.js │
   │ (Figma API で書き出し)               (Playwright) │
   ▼                                                 ▼
references/                                    renders/
  pc/hero.png                                    pc/hero.png
  sp/hero.png                                    sp/hero.png
   │                                                 │
   └─────────────────────┬───────────────────────────┘
                         ▼
                  visual-diff.js
              (pixelmatch でピクセル比較)
                         │
                         ▼
                  report/diff.json
              {
                "score": 0.92,
                "pass": false,
                "regions": [
                  { "component": "hero", "score": 0.85, "diffImage": "..." }
                ]
              }
                         │
                         ▼
              ┌──────────────────────┐
              │  Claude Code が判定   │
              │  pass: false なら     │
              │  ・diff画像を読む       │
              │  ・src/ を修正         │
              │  ・再度ループへ         │
              └──────────────────────┘
                         │
                         ▼
                     pass: true
              （再現率 95% 以上で完成）
```

## ディレクトリ構造

```
visual-diff-loop/
├─ README.md                    # この文書
├─ CLAUDE.md                    # Claude Code への指示書（このループを回す手順）
├─ package.json                 # 依存関係
├─ scripts/
│   ├─ fetch-figma.js           # Figma API でリファレンス画像を取得
│   ├─ render.js                # Playwright で生成HTMLをスクショ
│   ├─ visual-diff.js           # pixelmatch で比較・レポート生成
│   └─ targets.json             # 比較対象の定義（FigmaノードID と URL の対応）
├─ references/                  # Figmaから取得したリファレンス画像（自動生成）
├─ renders/                     # Playwrightで取得したスクショ（自動生成）
├─ report/                      # 差分レポート（自動生成）
└─ src/                         # 生成された静的HTML（Claude Code がここに出力）
```

## セットアップ

```bash
# 1. 依存関係のインストール
npm install
npx playwright install chromium

# 2. 環境変数の設定
export FIGMA_TOKEN="figd_xxxxxxxxxxxx"   # Figma個人アクセストークン
export FIGMA_FILE_KEY="xxxxxxxxxxxx"     # FigmaファイルキーURLの /file/<ここ>/...

# 3. 比較対象の定義
# scripts/targets.json を編集してFigmaノードIDと、表示URLを対応付ける
```

## 単体での実行

```bash
# Figmaからリファレンス画像を取得
node scripts/fetch-figma.js

# 生成HTMLをスクショ（事前にローカルサーバー起動が必要）
npx serve src -p 3000 &
node scripts/render.js

# 差分計測
node scripts/visual-diff.js

# レポート確認
cat report/diff.json
open report/index.html   # ビジュアル確認用HTML
```

## Claude Code から自動で回す

`CLAUDE.md` に書かれた手順に従い、Claude Code が以下を自走します:

1. デザイン（Figma URL）と中間仕様（spec.md）を受け取る
2. `src/` に静的HTMLを生成する
3. `npm run diff` を実行する
4. `report/diff.json` を読む
5. `pass: false` なら、差分が大きい領域の `diffImage` を読み込み、その情報を元に `src/` を修正
6. 再度 `npm run diff` → 閾値を超えるか上限回数まで反復

## 閾値の考え方

- **デフォルト閾値 95%**（差分率 5% 以下で合格）
- フォントのアンチエイリアス差で 1-3% は不可避
- 重要領域（CTA、ヘッダーロゴ等）は別途厳しい閾値を設定可能（targets.json で指定）
- 上限反復回数: **5回**（無限ループ防止）

## 想定される運用フロー

```
[デザイナー]
   Figmaを「コーディング可能なルール」で作成
        │
        ▼
[ディレクター/コーダー]
   Figma URLをspec.mdに記入し、Claude Code 起動
        │
        ▼
[Claude Code 自走]
   spec.md読込 → 生成 → diff → 修正 → diff → ... → pass
        │
        ▼
[コーダー]
   最終確認・微調整・バックエンド引き継ぎ
        │
        ▼
[バックエンドエンジニア]
   CMS（WOW3 or WordPress）に組み込み
```

## 注意事項

**フォントレンダリングの差**は最大の難所です。Figmaとブラウザでフォントのアンチエイリアス処理が違うため、完全一致は理論上不可能です。本ループは「構造・レイアウト・色の再現」を保証し、フォント描画の微差は許容します。

**ベクター画像（SVG）優先**。Figma側でアイコンや装飾は SVG として書き出せる構造にしておくと、ラスタライズの差を最小化できます。

**インタラクション（ホバー・スクロール連動）は本ループでは検証できません**。別途 Playwright でステート別スクショを取り、追加比較する拡張は可能です。
