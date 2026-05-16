# Figma構造チェック レポート（サンプル）

- 検査日時: 2026-05-16T12:00:00Z
- ファイル: `abc123XYZdef`
- 全ノード数: 247
- **判定: ✗ FAILED**
- エラー: 8 / 警告: 23 / 情報: 0

## 優先対応リスト

### [ERROR] auto-layout (5件)

対象のFrameを選択し、右側パネルの 'Auto layout' で Shift+A を押して有効化してください。

| ノード名 | メッセージ | リンク |
|---|---|---|
| Section / Hero | FRAMEがAuto Layoutを使用していません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A23) |
| Card / Feature | FRAMEがAuto Layoutを使用していません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A45) |
| Container / News | FRAMEがAuto Layoutを使用していません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A67) |
| Form / Contact | FRAMEがAuto Layoutを使用していません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A89) |
| Footer / Bottom | FRAMEがAuto Layoutを使用していません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A101) |

### [ERROR] variables-color (3件)

色を選び、カラーピッカーで Variable を選択。未作成なら 'Local variables' で先にトークンを定義してください。

| ノード名 | メッセージ | リンク |
|---|---|---|
| hero-title | 塗り色 #0066CC が Variable にバインドされていません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A24) |
| cta-button-bg | 塗り色 #FF8800 が Variable にバインドされていません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A102) |
| section-divider | 塗り色 #E0E0E0 が Variable にバインドされていません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A55) |

### [WARNING] naming (8件)

意味のある名前に変更してください（例: 'card-title', 'hero/background-image'）。

| ノード名 | メッセージ | リンク |
|---|---|---|
| Rectangle 23 | デフォルト名 "Rectangle 23" が残っています | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A301) |
| Frame 14 | デフォルト名 "Frame 14" が残っています | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A302) |
| Group 5 | デフォルト名 "Group 5" が残っています | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A303) |

### [WARNING] image-marker (10件)

対象レイヤーの名前を `@img-<意味のある名前>` に変更してください。

| ノード名 | メッセージ | リンク |
|---|---|---|
| hero-bg | 画像レイヤー "hero-bg" に @img- プレフィックスがありません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A28) |
| feature-icon-1 | 画像レイヤー "feature-icon-1" に @img- プレフィックスがありません | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A48) |

### [WARNING] hard-to-reproduce (5件)

再現困難な効果が検出されました。代替表現（box-shadow、背景画像化、SVG書き出し等）への置き換えを検討してください。

| ノード名 | メッセージ | リンク |
|---|---|---|
| hero-glow | 強い BACKGROUND_BLUR (radius=48) が使われています — backdrop-filter で近似可能ですがブラウザ差が大きいです | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A27) |
| section-overlay | 非標準の blend-mode "MULTIPLY" が使われています — CSS mix-blend-mode で近似可能だがブラウザ差あり | [開く](https://www.figma.com/file/abc123XYZdef?node-id=1%3A56) |

---

## デザイナーへの修正依頼テンプレート

> お疲れさまです。AIコーディング前の構造チェックで以下が検出されました。
>
> **エラー（8件、必須対応）**
> - Auto Layout 未適用が5箇所（Hero / Card / Container / Form / Footer）
> - Variables 未バインドの色が3箇所
>
> **警告（23件、可能であれば対応）**
> - レイヤー名のデフォルトが8箇所
> - 画像書き出しマーカー `@img-` 漏れが10箇所
> - 再現困難な効果（強いブラー、特殊blend-mode）が5箇所
>
> エラー部分の修正後、再度チェックを実行してPASSさせてからコーディングに渡してください。
