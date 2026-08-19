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

## M5.1（実装済み）

保存構造と Rush 再生ロジックは変えず、多数の Cut を扱いやすくする UI / 操作改善。

- ページ送りを PDF 表示枠の直下へ移す。ロジックは M0 のまま
- Cut 一覧は約 100 Cut を俯瞰できる高密度 1 行表示（CUT番号、尺、frames、所属数、完成状態）
- Timeline 完成 / 未完成は描画時に既存 `isComplete` から導出する。保存フラグは足さない
- Cut 一覧と詳細編集ペインを分離する。行展開やモーダルは使わない
- CUT番号と尺は個別にクリアする。Panel 選択と Cut Data は触らない
- Panel テンプレートはメモリ上の UI 状態 `{ width, height }` のみ。Panel Data には入れない
- 最初の Panel は従来ドラッグ。以降は前回サイズを `stamp` で利用できる
- `drag` / `stamp` は明示的なモード切替。最初の 1 件のあと自動では切り替えない
- stamp のクリックは候補の位置指定・移動のみ。クリック位置は矩形中心。ページ端は 0〜1 にクランプ
- 候補クリックでは確定しない。確定は「この位置で登録」。破棄は「やめる」と Esc
- 幅・高さはページに対する % で調整する
- 登録成功のたびにテンプレートサイズを更新する
- 確定済み Panel の移動・リサイズは実装しない
- PDF 再選択成功時はテンプレートを破棄する。失敗維持時は残す
- Panel / Cut / Timeline / Rush の保存構造は変えない
- Rush 再生ロジックは変えない

確定済み Panel の移動・リサイズ、Cut 並べ替え、MP4 は M5.1 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M5.1 節を正とする。

## M5.2（実装済み）

保存構造と Rush 再生ロジックは変えず、既存 Cut の編集導線を明確にし、横 Timeline で `startFrame` をドラッグ編集する。

- 新規 Cut と既存 Cut 編集は別フォーム。「新規 Cut」と「CUT nnn を編集中」
- 既存 Cut の番号・尺は「変更を保存」で初めて Store へ反映する。検証は M3 / M4 のまま
- 横 Timeline は左カラム（ページ送りの下、Rush より上）。`durationFrames` が全幅
- 右端ラベルは排他の総尺。有効開始は `0 … durationFrames - 1`
- frame → x は `startFrame / durationFrames * width`
- x → frame は `round` して整数スナップし、`0 … durationFrames - 1` にクランプ
- 配置済みマーカーのみドラッグする。未配置の初回は数値「配置」
- ドラッグ中は候補だけ。pointerup で検証してから Store を更新する
- 同一 `startFrame` は拒否し、空き frame へ自動移動しない
- 確定失敗 / Esc / pointercancel では、マーカーと数値欄を保存済み値へ戻す。Store は触らない。Rush は dirty にしない。候補値を入力欄へ残さない。理由は Timeline 編集欄へ出す
- `0f` マーカーは移動可能。無くなったら未完成。他を自動で `0f` にしない
- 数値入力とマーカーは、確定後に双方向同期する。正本は Timeline Store の整数 `startFrame`
- 表示区間は導出のみ。`endFrame` は保存しない
- Cut 尺変更成功時は同じ `startFrame` の相対位置だけ再計算する。はみ出し短縮は保存拒否
- Timeline 更新成功時だけ Rush を dirty にする
- 新規は `js/timeline-editor.js`。Store は所有しない
- Panel / Cut / Timeline / Rush の保存構造は変えない
- Rush 再生ロジックは変えない

区間両端リサイズ、未配置のバーへのドロップ、Cut 並べ替え、Rush スクラブ、MP4 は M5.2 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M5.2 節を正とする。

## M5.3（実装済み）

保存構造と Rush 再生ロジックは変えず、Panel 取得の標準操作を常設選択フレームへ移し、限定した Undo / Redo を足す。

- 常設フレームはページ中央、幅約 45%、見た目 16:9 で初期表示する
- 16:9 は overlay の CSS ピクセル見た目とする。相対座標の比ではない
- 枠内部ドラッグで移動、四隅ハンドルでリサイズ。ページ外へ出さない
- 「16:9を維持」は初期 ON。OFF では自由比率。ON へ戻すときは幅を維持して高さを合わせる
- 「画像取得」で現在枠を既存 Panel 形式として登録する。登録後も枠は残す
- ページ送りでは位置・サイズを維持し、はみ出しだけクランプする。PDF 再選択成功時だけ初期化する
- stamp 専用 UI は常設フレームへ統合して外す。自由ドラッグは別サイズ取得の例外として残す
- drag 確定後に常設フレームの位置・サイズを変えない
- Undo / Redo の必須対象は Panel 登録、Panel 削除、Timeline の `startFrame` 確定
- 選択フレームの移動・リサイズ・lock は履歴に入れない
- 新規 `js/history.js`。`push` / `undo` / `redo` / `canUndo` / `canRedo` / `clear`。Store は所有しない
- 新操作の push で Redo を破棄する。履歴はメモリのみ
- Panel 登録の Redo は同じ id で復元する。削除 Undo は Panel・Cut 所属・所属順・Timeline placement を戻す
- `panel-store.js` に既存 id 復元 / 指定位置挿入を足してよい。Panel のフィールドは増やさない
- 入力欄フォーカス中はアプリの Undo / Redo を発火しない
- 確定成功とその Undo / Redo のあと既存 `markRushDirty()` を呼ぶ。`rush-player.js` は変えない
- Panel / Cut / Timeline / Rush の保存構造は変えない
- 画面高さを超えたらページを縦スクロールする。Cut 一覧は従来どおり一覧内スクロール
- PDF viewer は `min(52vh, 38rem)` に収め、下部 UI を `overflow: hidden` で切らない
- 未配置は数値「配置」に加え、選択して横バーをクリック / ドラッグして初回配置できる
- 選択中マーカーは `← / →` で 1f、`Shift` 併用で 5f。未選択時は矢印を Timeline に使わない

Cut 編集の Undo、確定済み Panel の移動、履歴永続化、MP4 は M5.3 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M5.3 節を正とする。

## 以降（構想）

順序の目安であり、確定した計画ではない。M6 以降の詳細モデルはまだ作らない。

データ境界との対応は [DATA_MODEL.md](DATA_MODEL.md) の将来節を参照する。

| 候補 | 想定する前進 |
|---|---|
| M6 | MP4。同じ frame 列と切り出し入口から動画ファイルを出す |

M6 以降でやり得ることの例（未着手、M5.3 には入れない）:

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
