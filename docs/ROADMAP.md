# ロードマップ

次マイルストーンに入っていない機能は実装しない。時期は約束しない。

## M0（実装済み）

ローカル PDF を開き、ページを表示・移動できる状態にする。

- PDF ファイル選択 UI
- ローカル PDF の読み込み
- 1ページ目の描画
- 前ページ / 次ページ
- 現在ページ / 総ページ数の表示
- 別 PDF の再選択
- PDF を外部へ送信しない

仕様は [SPEC.md](SPEC.md) の M0 節を正とする。

## M1（実装済み）

表示中ページ上で、手動のコマ候補（Panel）を登録できる状態にする。

- ドラッグによる Panel 登録（`source: "manual"`）
- 現在ページの Panel をオーバーレイ表示
- 全 Panel の一覧（`pageNumber` 昇順、同一ページ内は登録順）
- Panel 削除
- 別 PDF 読み込み成功時の Panel クリア
- 相対座標（0〜1）で位置を保持する

Storyboard Data の完全定義は M1 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M1 節を正とする。

## M2（実装済み）

Panel の相対座標から PDF ページ画像を切り出し、一覧で確認できるようにする。

- 表示用とは別 canvas での切り出し
- 表示していないページも、表示ページを切り替えずに切り出す
- Panel 一覧への確認用サムネイル
- メモリ上のサムネイルキャッシュ（Panel 本体には持たない）
- Panel 削除・PDF 読み込み成功時のキャッシュ破棄

OCR 用画像の定義、画像ファイルの書き出しは M2 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M2 節を正とする。

## M3（実装済み）

人手で Cut を持ち、CUT 番号・総尺・所属 Panel を関連付けられる状態にする。

- Cut の作成（選択した Panel 群）
- `cutNumber`（文字列。入力表記のまま。完全一致の重複は不可）
- 総尺の正規値 `durationFrames`（秒+コマは 24fps で換算する入力）
- 1 Cut に複数 Panel を所属させる（再生順は定義しない）
- Cut の編集・削除
- Panel 削除時に Cut 側の参照を外す
- PDF 読み込み成功時の Cut クリア

各 Panel の開始フレーム、表示区間、切替、トランジション、OCR、Timeline、Rush は M3 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M3 節を正とする。

## M4（実装済み）

Cut 内の各 Panel に開始フレームを人手で置ける状態にする。再生はしない。

- Cut 1 件につき Timeline は 0 または 1 件（`cutId` + `placements`）
- Cut 本体へ `startFrame` / `placements` を埋め込まない
- `startFrame` は 0 始まり整数、`0 ≤ n < durationFrames`、同一 Cut 内で重複禁止
- 表示区間は次の `startFrame` または `durationFrames` から導出する（`endFrame` は保存しない）
- 所属 Panel はすべて配置必須。未配置は未完成
- 1 Panel Cut は、新規作成時、または既存 Cut を Timeline 編集対象として初めて扱う際に Timeline 未作成なら `0f` 自動配置
- 複数 Panel には自動配置しない。既存 Timeline は書き換えない
- 尺短縮で `startFrame` が総尺外になる変更は拒否する
- Cut / Panel 削除と PDF 再選択成功時に Timeline の参照を残さない
- 新規モジュールは `js/timeline-store.js` のみを想定する。Rush モジュールは作らない

Rush、play / pause、再生ヘッド、実時間タイマー、MP4、トランジション、PAN / TU / TB、`endFrame` の保存は M4 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M4 節を正とする。

## 以降（構想）

順序の目安であり、確定した計画ではない。M5 以降の詳細モデルはまだ作らない。

データ境界との対応は [DATA_MODEL.md](DATA_MODEL.md) の将来節を参照する。

| 候補 | 想定する前進 |
|---|---|
| M5 | Rush。配置完了した Timeline を時間軸に沿って再生する |

M5 以降でやり得ることの例（未着手、M4 には入れない）:

- Rush 再生
- play / pause、再生ヘッド、実時間タイマー
- 動画再生
- MP4 出力
- Panel 同士の切替タイミングの保存
- ディゾルブ等のトランジション
- カメラワーク解析（PAN / TU / TB 等）
- Panel の自動検出（`source: "auto"`）
- CUT 番号の OCR / 自動認識
- AI 解析

## 進め方

- 実装済みの事実と構想を、README / SPEC / 本ドキュメントで分けて書く
- 次マイルストーンに入っていない機能の UI や空モジュールは作らない
- マイルストーンを進めるときは、先に SPEC と DATA_MODEL を更新してからコードを書く
