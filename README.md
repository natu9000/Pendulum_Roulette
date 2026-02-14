# Pendulum Roulette (Double Pendulum Minimal Demo)

依存ライブラリなしで動く、二重振り子の最小デモです。`index.html` を開くだけで動作します。

## 使い方

- ローカル: `index.html` をブラウザで開く
- GitHub Pages: リポジトリ直下に `index.html` と `app.js` を置いたまま公開

## Seed の再現

- URL に `?seed=1234` を付けると同じ初期条件で再現できます
- 例: `https://<user>.github.io/<repo>/?seed=1234`
- `Randomize` ボタンで新しい seed (`Date.now()`) に更新します

## 操作

- `Reset`: 同じ初期条件で再スタート
- `Randomize`: 新しい seed で腕長と初期角を再生成
- `Pause`: 一時停止 / 再開
