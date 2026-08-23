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

## M5.4（実装済み）

保存構造と Rush 再生ロジックは変えず、整数 frame の表示を秒+コマと総フレームの併記にする。秒+コマは表示専用とする。

- 正は整数 `startFrame` / `durationFrames`。秒やコマを保存しない
- 24fps は既存 `FRAMES_PER_SECOND` のみ。変換は `duration.js` の formatter に集約する
- `formatFrameTime` / `formatFrameTimeLabel` / `formatFrameRange` を既存 `formatDuration*` へ委譲する
- Timeline / Rush へ変換式を重複して書かない
- 配置済みは `1+18（42f）`。マーカーは `1+18` と `42f` の 2 段
- 数値 start 入力は整数のまま。有効時だけ `= 1+18` を補助表示する
- 導出区間は inclusive 最終 frame。例: `1+12–2+11（36–59f）`
- Cut 総尺は既存の `3+12（84f）`。横バー右端は排他総尺、左端は有効 `0`
- ドラッグ・矢印キー・「配置」は変えない
- Rush メーターは表示のみ。`Local` は現在 Cut 内、`Global` はラッシュ全体
- Cut 新規作成時は `panelIds` 順で `floor(durationFrames * i / N)` に均等配置する。1 Panel は `0f`
- 総尺が短く開始が重なるときは自動配置せず、未完成のまま理由を出す
- 既存 Cut への Panel 追加では再均等しない
- 保存項目は増やさない。`rush-player.js` は変えない

秒+コマ入力、fps 変更、タイムシート、MP4 は M5.4 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M5.4 節を正とする。

## M6（実装済み）

Panel / Cut / Timeline の保存項目は変えず、独立した Motion で PAN / TU / TB をブラウザ Rush に乗せる。MP4 は出さない。

- Motion は `{ cutId, motions: [{ panelId, from, to }] }`。`from` / `to` は `{ x, y, scale }`
- `type` も開始・終了 frame も保存しない。PAN / TU / TB はラベル。時間は Timeline 表示区間に従属
- 表示区間が 1 フレームのときは作成・編集不可。既存 Motion は消さず、Rush では適用しない
- `x` / `y` は Panel 画像内の viewport 中心（0〜1）。`scale` 1.0 は内接最大 16:9
- 出力は 16:9 crop。Motionなしは contain の静止
- 線形補間。inclusive 最終 frame で `to`
- 編集 UI は Cut 詳細。Panel 画像上の START / END 枠。PDF 選択フレームとは別座標
- `rush-player.js` の時刻解決は維持。描画は `renderFrame({ canvas, image, pose })`
- 新規は `js/motion-store.js`、`js/frame-renderer.js`、`js/motion-editor.js`
- Motion 作成・削除・from/to 確定は Undo / Redo 対象
- Panel / Cut 削除と PDF 再選択成功で Motion 参照を残さない
- Panel / Cut / Timeline のフィールドは増やさない

MP4 / WebM / 音声 / ease / 複数 Motion 連結 / 部分区間 Motion / 回転は M6 の範囲ではない。仕様は [SPEC.md](SPEC.md) の M6 節を正とする。

## M7（実装済み）

同じ Frame Renderer の 1 フレーム描画から、ブラウザ内で H.264 MP4 を出す。

- 出力は 1280×720、24fps（`FRAMES_PER_SECOND`）、映像のみ。音声なし
- エンコードは WebCodecs、mux は Mediabunny `1.51.0`。`mp4-muxer` と ffmpeg.wasm は第一候補にしない
- Rush の rAF 時計は使わない。`buildSnapshot` / `resolveFrame` と `renderFrame` を再利用する
- 開始時に Cut / Timeline / Motion / Panel 矩形を凍結する
- 書き出し画像は `RushImageCache` と分離する。pdfScale は Panel ごとの Motion 最大 scale から決める
- 事前に `VideoEncoder` と AVC 1280×720 の encodability を確認する
- 未完成 Cut が 1 件でもあれば拒否する
- 進捗とキャンセルを出す。部分 MP4 は保存しない
- 完成 Blob を `<PDF名>-rush.mp4` としてローカル保存する。サーバーへ送らない
- Panel / Cut / Timeline / Motion のフィールドは増やさない

新規: `js/mp4-exporter.js`、`js/export-image-cache.js`、`js/frame-pose.js`。仕様は [SPEC.md](SPEC.md) の M7 節を正とする。

## M8（実装済み）

同一 Panel を Cut 内で複数 placement し、所属順 Repeat を編集コマンドとして Timeline へ書き込む。再生モードは増やさない。

- placement は `{ id, panelId, startFrame }`。一意性は `startFrame`
- Cut.panelIds は使用可能な素材。同じ id を複数入れない
- 完成条件から「所属全員ちょうど 1 件」を外す。0f と妥当な placements があれば完成
- Repeat は確認のうえ全置換。Undo 1 回で元 Timeline。設定は保存しない
- 連続同一 Panel の collapse は Repeat 生成時のみ
- Motion は panelId のまま。pose は **現在の表示区間** で sample する
- Rush 時計と MP4 経路に Repeat を足さない
- Panel / Cut / Motion のフィールドは増やさない

仕様は [SPEC.md](SPEC.md) の M8 節を正とする。アプリ実装済み。

## M9（実装済み）

完成 Timeline と Motion から、JIS B4 縦の印刷用タイムシート PDF を一方向に出す。

- 1 シート 144f（6 秒 × `FRAMES_PER_SECOND`）。紙面は 1〜144。内部 0f は行 1
- CELL A 列のみ。`panelIds` 順の自前丸数字。継続は縦線。シート先頭は再番号
- 出力時だけ同一 panelId 連続 placement を collapse。Store は変えない
- CAMERA は既存 `motionLabel`。A→線→最終frameだけ矢印head+B。pre/post FIX を FIX 縦線で表す
- 話数 / タイトルは PDF セッションの UI 状態。Cut には保存しない
- pdf-lib `1.17.1`。JIS B4 **縦**（257mm × 364mm）。ロゴなし
- Panel / Cut / Timeline / Motion / Rush / MP4 は変えない

仕様は [SPEC.md](SPEC.md) の M9 節を正とする。

## M10（実装済み）

PDF 以外からも Panel 素材を足せるようにする。お絵描きソフトにはしない。「ラッシュに 1 枚足したい」「中間のラフを描きたい」ための簡易 Panel 作成である。

実装は次の 5 段に分ける。ユーザーから見ると一つの機能群である。

### M10.0 Panel Image Provider と source 拡張（実装済み）

- Panel を discriminated union にする。`source: "manual"` は PDF 切り出しのまま。`"drawing"` / `"upload"` を足す
- PDF 矩形（`pageNumber` / `x` / `y` / `width` / `height`）を drawing / upload へダミーで入れない
- 画像バイトは Panel レコードに埋め込まない。`PanelMediaStore` が Blob を持つ
- `js/panel-image-provider.js` が `panelId` → 描画可能画像の唯一の入口になる
- Thumbnail / Rush / Export は Provider 経由。Motion Editor は Provider が埋めた既存 cache を読む
- `cropPanelImage` は PDF 実装詳細に残す
- Export の Motion 連動 pdfScale（M7）を壊さない
- UI から drawing / upload はまだ作れない。一覧順は PDF を pageNumber 順のまま（pageNumber 無しは後ろへ）

### M10.1 Drawing Panel と Upload Panel（実装済み）

- 手描き: 16:9、白地、黒ペン / 消しゴム、サイズ 3 段階、編集中 Undo/Redo、全消去、確定 / キャンセル、再編集
- Pointer Events。筆圧・色・レイヤー・図形・テキストは持たない
- 正本解像度は 1280×720。CSS 表示サイズや `devicePixelRatio` を正本にしない
- Upload: PNG / JPEG / WebP。16:9 でなくても拒否しない
- 既存 upload の画像差し替え（Panel id 維持）
- Cut / placement / Repeat / Motion / Rush / MP4 / タイムシート番号は通常 Panel と同じ
- PDF 再選択成功時は drawing / upload も含め全 Panel を clear

### M10.2 Onion Skin（実装済み）

- 手描き編集中に、Timeline placement 上の前後 Panel を半透明表示する
- ON/OFF と opacity。stroke より背面。保存画像には焼かない
- 前後は `placementId` → 隣接 range → `panelId` → Provider。Cut.panelIds 順でも PDF ページ順でもない
- placement 文脈が無ければ Onion は無効
- 透かすのは元 Panel 画像。Motion crop 後の画は使わない

### M10.3 Timeline / Onion の見え方（実装済み）

- 保存構造は変えない。新しい Store も作らない
- 追加候補: サムネイル / `Cut.panelIds` の 1-based 番号 / 種別 / startFrame / 秒+コマ / ［追加］
- 配置済み: サムネイル / 番号 / start の秒+コマと frame / 導出区間 / ［削除］。drawing だけ ［絵を編集］
- 横 Timeline マーカーと配置済み行の選択は `placementId`。同じ `panelId` の別 placement は独立
- ［削除］は placement だけ。Panel / `Cut.panelIds` / MediaStore / Motion は残す
- Onion に説明と前後サムネ・番号を出す。先頭 / 末尾は「前の絵はありません」「次の絵はありません」
- Panel 一覧の［編集］では前後を推測せず、Timeline の［絵を編集］へ案内する
- 画像は既存 ThumbnailCache / Panel Image Provider。Onion は reference のみ

### M10.4 Timeline ＋挿入（実装済み）

- 横 Timeline の空白へ pointer を置くと、既存のカーソル追従プレビュー（＋）が出る。別描画の常設＋は置かない
- ＋クリックで挿入メニュー。追加位置（秒+コマ+frame）、［既存Panelを追加］［手描きPanelを追加］
- 候補 startFrame は既存の `xToFrame`。メニューを開いた瞬間に固定
- 既存 Panel は所属素材から選び、同じ `addPlacement` へ置く。同じ Panel の再配置可
- 手描きは未確定の挿入 context で Editor を開き、`neighborsAroundFrame` の左右を Onion にする。キャンセルで何も残さない
- 確定は Panel + MediaStore + Cut 所属 + placement を 1 Action「手描きPanelをTimelineへ追加」
- 既存編集の Onion 解決（`onionNeighbors`）は変えない
- 詳細側の Panel 追加 UI は残す

仕様は [SPEC.md](SPEC.md) の M10 節を正とする。

## 以降（構想）

順序の目安であり、確定した計画ではない。

データ境界との対応は [DATA_MODEL.md](DATA_MODEL.md) の将来節を参照する。

| 候補 | 想定する前進 |
|---|---|
| M11 以降 | 音声、タイムシート編集、プロジェクト保存 など |

M10 以降でやり得ることの例（未着手、M10 には入れない）:

- ACTION 自動記入、CELL B〜F、タイムシート import
- 音声 / BGM / SE / AAC
- 1080p 選択、bitrate / fps UI
- WebM / MOV
- File System Access API への直接書き
- Repeat 回数入力、Panel ごと hold、任意列エディタ
- placement 単位 Motion
- ループ再生
- スクラブバー、再生ヘッドのドラッグ
- 再生速度変更
- Panel 表示の途中だけにかける Motion
- 1 Panel 内の複数 Motion 連結
- ディゾルブ等のトランジション
- カメラワークの自動解析
- Panel の自動検出（`source: "auto"`）
- CUT 番号の OCR / 自動認識
- AI 解析

## 進め方

- 実装済みの事実と構想を、README / SPEC / 本ドキュメントで分けて書く
- 次マイルストーンに入っていない機能の UI や空モジュールは作らない
- マイルストーンを進めるときは、先に SPEC と DATA_MODEL を更新してからコードを書く
