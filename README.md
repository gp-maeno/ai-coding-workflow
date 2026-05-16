# ai-coding-workflow

ウェブ制作会社向けに「**Figma → Claude Code → 高再現率コーディング**」を実現する AI エージェントワークフローの設計・プロトタイプリポジトリ。

提案資料・参照実装・Claude Code 用 Skill 群・差分検証ループを一式まとめている。プロダクション用ライブラリではなく、社内ワークフロー設計の叩き台として使う。

## なぜ作るのか

Figma MCP 経由で Claude Code にコーディングさせると、「だいたい合っているがピクセル単位で見ると違う」状態で止まる。原因は AI 側に「正解と比較する目」と「デザインの構造化された読み方」が無いこと。

このリポジトリは以下の3つを組み合わせて再現率を上げる:

1. **デザイン側のゲート** — Figma が AI に渡せる構造になっているかを機械的に検査
2. **中間仕様の文書化** — Figma の暗黙情報を `spec.md` に書き出して AI に読ませる
3. **ビジュアル差分の自己修正ループ** — Playwright + pixelmatch で再現率を測り、閾値未満なら Claude が自分で直す

## 全体ワークフロー

```
[案件開始]
   │
   ▼
① figma-structure-check  ── Figma構造がAI可読か検査（PASSしないと進めない）
   │
   ▼
② figma-to-spec          ── 中間仕様 spec.md を生成
   │
   ▼
③ visual-diff-loop       ── 再現率95%以上まで Claude が自己修正ループ
   │
   ▼
④ workflow-improvement   ── retrospective 生成 → ルール改善案にフィードバック
   │
   ▼
[次の案件でルールが賢くなっている]
```

詳細は [`manual.html`](./manual.html) の「ワークフロー全体図」セクションを参照。

## ディレクトリ構成

| パス | 役割 |
|------|------|
| [`proposal.html`](./proposal.html) | クライアント・社内向けの提案資料（単一HTML） |
| [`manual.html`](./manual.html) | コーダー向け使い方マニュアル（単一HTML） |
| [`skills/figma-structure-check/`](./skills/figma-structure-check/) | Figma 構造の機械チェック Skill |
| [`skills/figma-to-spec/`](./skills/figma-to-spec/) | 中間仕様 `spec.md` 生成 Skill |
| [`skills/workflow-improvement/`](./skills/workflow-improvement/) | 案件後の自己改善ループ Skill |
| [`visual-diff-loop/`](./visual-diff-loop/) | Figma 正解画像と生成HTMLのピクセル差分ループ（Node.js） |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 向けプロジェクト指示書 |

## 使い始める

### 1. 提案・マニュアルを読む

```bash
open proposal.html   # 提案ストーリー（経営層・ディレクター向け）
open manual.html     # コーダー向け実行手順
```

### 2. visual-diff-loop のセットアップ

```bash
cd visual-diff-loop
npm install
npx playwright install chromium
cp .env.example .env  # Figma API トークンを設定（存在する場合）
```

詳細は [`visual-diff-loop/README.md`](./visual-diff-loop/README.md) と [`visual-diff-loop/CLAUDE.md`](./visual-diff-loop/CLAUDE.md) を参照。

### 3. Skill を Claude Code に認識させる

リポジトリ直下を Claude Code のプロジェクトとして開けば、`skills/*/SKILL.md` の各Skillと `CLAUDE.md` が自動で読み込まれる。

## 開発上のルール

- ドキュメント・コメントは**日本語**。変数名・関数名・スクリプト名は英語
- Skill 追加時は `skills/<name>/SKILL.md` に YAML frontmatter (`name`, `description`) 必須
- **コード変更時は `proposal.html` / `manual.html` が陳腐化していないか必ず確認**（詳細は [`CLAUDE.md`](./CLAUDE.md)）
- `visual-diff-loop/references/`, `renders/`, `report/`, `retrospectives/` は自動生成物。手で触らない

## ステータス

プロトタイプ段階。社内導入に向けた検証・調整中。社外配布は未定。

## ライセンス

社内利用前提のため未設定。社外公開時に検討する。
