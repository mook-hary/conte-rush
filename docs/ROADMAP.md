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

## M5（実装済み）

配置完了した Cut を登録順に連結し、24fps の静止画ラッシュとして再生できる状態にする。MP4 は出力しない。

- 未完成 Cut が 1 件でもあれば全体の再生開始を拒否する
- 再生順は Cut の登録順。並べ替え UI は置かない
- global 区間は再生時に導出する。Cut には保存しない
- Play 時に一時スナップショットを作り、再生中は live データを読まない
- 必要 Panel 画像を Rush 用キャッシュへすべて用意してから時計を開始する
- 画像が 1 件でも失敗したら再生しない
- `requestAnimationFrame` + `performance.now()`。fps は `FRAMES_PER_SECOND`
- Play / Pause / 先頭へ戻る。編集なしの再開はキャッシュを再利用する
- dirty な次回 Play はスナップショット再構築、不足画像のみ生成、`currentFrame = 0`
- 最終フレーム（`totalFrames - 1`）を 1/24 秒相当表示して停止し、画像を維持する
- 新規は `js/rush-player.js` と `js/rush-image-cache.js`。ThumbnailCache は使わない
- Panel / Cut / Timeline の保存構造は変えない

MP4、音声、トランジション、PAN / TU / TB、ループ、スクラブ、フルスクリーン、Cut 並べ替えは M5 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M5 節を正とする。

## 以降（構想）

順序の目安であり、確定した計画ではない。M6 以降の詳細モデルはまだ作らない。

データ境界との対応は [DATA_MODEL.md](DATA_MODEL.md) の将来節を参照する。

| 候補 | 想定する前進 |
|---|---|
| M6 | MP4。同じ frame 列と切り出し入口から動画ファイルを出す |

M6 以降でやり得ることの例（未着手、M5 には入れない）:

- MP4 / WebM 出力
- 音声 / BGM / SE
- ループ再生
- スクラブバー、再生ヘッドのドラッグ
- 再生速度変更、fps 変更 UI
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
