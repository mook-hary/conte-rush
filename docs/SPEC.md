# 仕様

この文書は、実装済みとして扱う仕様と、扱わない範囲を分けて書きます。M10.0 / M10.1 / M10.2 / M10.3 / M10.4 は実装済みです。M11.0〜M11.4 と M11.6 は実装済みです。M11.7 / M11.8 は計画です。将来構想は「将来」節に限ります。

対象マイルストーン:

- **M0**: 実装済み
- **M1**: 実装済み
- **M2**: 実装済み
- **M3**: 実装済み
- **M4**: 実装済み
- **M5**: 実装済み
- **M5.1**: 実装済み
- **M5.2**: 実装済み
- **M5.3**: 実装済み
- **M5.4**: 実装済み
- **M6**: 実装済み
- **M7**: 実装済み
- **M8**: 実装済み
- **M9**: 実装済み
- **M10**: M10.0 / M10.1 / M10.2 / M10.3 / M10.4 実装済み
- **M11.0**: 実装済み（Auth / 利用権基盤）
- **M11.1**: 実装済み（社内 SQL 付与。通常付与は M11.6）
- **M11.2**: 実装済み（歴史。当時の Test Payment Link。現行課金経路としては廃止）
- **M11.3**: 実装済み（webhook → subscriptions。Test Mode）
- **M11.4**: 実装済み（現行課金経路。Checkout Session + Portal。Test Mode。post-cleanup 済み）
- **M11.5**: 未着手（Cloudflare Pages。正式公開の blocker ではない）
- **M11.6**: 実装済み（internal invite self-serve）
- **M11.7**: 計画（正式公開前の法務・表示。公開 blocker）
- **M11.8**: 計画（Stripe 本番モード切替。公開 blocker）

## 目的

- M0: 絵コンテ PDF をローカルから読み込み、ブラウザ上でページ単位に表示する
- M1: 表示中ページ上でユーザーが矩形を指定し、コマ候補（Panel）として手動登録する
- M2: Panel の相対座標から PDF ページ画像を切り出し、一覧で確認用プレビューを表示する
- M3: 人手で Cut を持ち、CUT 番号・総尺・所属 Panel を関連付ける
- M4: Cut 内の各 Panel に開始フレームを人手で置く
- M5: 配置完了した Cut を時間軸に沿って静止画ラッシュとして再生する
- M5.1: 保存構造を変えず、ページ送り・Cut一覧・入力クリア・Panel 連続登録の UI を改善する
- M5.2: 保存構造を変えず、既存 Cut の編集導線と横 Timeline のドラッグ編集を追加する
- M5.3: 保存構造を変えず、常設選択フレームによる Panel 連続取得と、限定した Undo / Redo を追加する。画面高さ不足時はページを縦スクロールし、複数 Panel の初回配置と 1f 微調整を足す
- M5.4: 保存構造と再生ロジックを変えず、Timeline 編集 UI（および Rush メーター）の frame 表示を秒+コマと総フレームの併記にする
- M6: Panel / Cut / Timeline の保存項目は変えず、独立した Motion Data で PAN / TU / TB をブラウザ Rush 上に再生する。MP4 は出さない
- M7: M6 と同じ Frame Renderer の結果を、ブラウザ内で 16:9 / 24fps / 映像のみの H.264 MP4 として書き出す。音声は扱わない
- M8: 同一 Panel を Cut 内で複数 placement できるようにし、所属順の Repeat 展開を編集コマンドとして Timeline へ書き込む。再生モードは増やさない
- M9: 最終 Timeline と Motion から、印刷用の B4 縦タイムシート PDF を一方向に出力する。タイムシートは正本にしない
- M10: PDF 以外（手描き / ローカル画像）からも Panel 素材を足す。お絵描きソフトにはしない。実装は M10.0 / M10.1 / M10.2 / M10.3 / M10.4
- M11.0: ログインと利用権（internal / paid / none）を Supabase に分離する。制作素材は送らない。当時は Stripe 決済を実装しない（現行の課金は M11.4）

責務の境界:

- Panel = ラッシュに使える 1 枚のコンテ画像（PDF crop / 手描き / Upload）
- Cut = CUT 番号、総尺、所属 Panel
- Timeline = Cut 内で各 Panel がいつ始まるか
- Motion = ある Panel 表示区間内で、出力フレームへどこを crop して出すか
- Rush = Timeline + Motion を時間軸に沿って再生したもの（M6 はブラウザ再生。M7 は同じ描画結果の MP4）
- Auth / Access（M11.0）= ログインと利用権。制作データの正ではない。現行の課金経路は M11.4

M1 の Panel は絵コンテ上の 1 つのコマ候補である。CUT 番号でも尺でもない。

M2 の切り出し画像は確認用プレビューである。OCR や画像解析用の入力そのものではない。

M3 の Cut は所属の関連付けまでである。各 Panel の開始フレームや切替タイミングではない。

M4 の Timeline は開始フレームだけである。再生や `endFrame` の保存ではない。

M5 の Rush は再生時に導出した一時構造である。Cut / Timeline へ埋め込まない。MP4 ではない。

M5.1 の Panel テンプレートと Cut 選択は UI 状態だけである。Panel / Cut には保存しない。

M5.2 の横 Timeline は `startFrame` の編集 UI である。Cut へ開始フレームを埋め込まない。`endFrame` は保存しない。

M5.3 の常設選択フレームと履歴は UI 状態だけである。Panel Data には入れない。履歴はメモリ上のみとする。

M5.4 の秒+コマは表示専用である。保存の正は整数 frame のままとする。秒やコマを別フィールドとしては持たない。

M6 の Motion は独立データである。Panel / Cut / Timeline へ埋め込まない。時間区間は Timeline の表示区間から導出し、M6 では保存しない。

M7 の MP4 は実行時の書き出しである。Panel / Cut / Timeline / Motion へ埋め込まない。音声は持たない。

## 制約

- GitHub Pages で動作する静的 Web アプリとする。正式有料公開も GitHub Pages のままでよい（M11.5 Cloudflare は公開ブロッカーではない）
- HTML / CSS / JavaScript を使う
- ビルドツールは使わない
- Auth / 利用権は hosted Supabase を使う。独自サーバーと Cloudflare Functions は必須にしない
- PDF はユーザーが選んだローカルファイルのみを対象とする
- PDF / Panel 画像 / Drawing / Upload / Rush / MP4 / Timesheet をサーバーや Supabase へ送信しない
- 生成した MP4 もサーバーへ送信しない。ブラウザ内の Blob として保存する
- PDF の処理はブラウザ内で完結させる
- 表示には PDF.js を使う
- Panel、Cut、Timeline、Rush の再生状態はブラウザのメモリ上のみとする。保存しない
- 制作データを localStorage / IndexedDB に置かない。Auth session の保持だけ supabase-js の既定 storage を使ってよい
- M0 の PDF 読み込み・描画の責務を、Panel 操作と混ぜない
- 表示用 canvas と切り出し用 canvas を分けて使う
- Panel 本体に画像データ、CUT 番号、尺を持たせない
- 切り出し処理とサムネイルキャッシュを分ける
- Cut に各 Panel の時間配置を持たせない
- Cut に global 開始 / 終了フレームを持たせない
- Timeline に `endFrame` を保存しない
- Rush 専用の永続データモデルを足さない
- M2 のサムネイルキャッシュを Rush 表示に使わない
- 再生開始前に、スナップショットで使う Panel 画像をすべて用意する
- 24fps 定数は `duration.js` の `FRAMES_PER_SECOND` のみとする
- Panel テンプレート、登録モード、候補矩形はメモリ上の UI 状態のみとする。Panel Data へ入れない
- 確定済み Panel の移動・リサイズはしない
- Rush の再生ロジックを、UI 改善のために変えない
- 横 Timeline のドラッグ中に Timeline Store を書き換えない
- ドラッグ確定失敗時は保存済み `startFrame` へ戻し、Rush を dirty にしない
- 常設選択フレームはメモリ上の UI 状態のみとする。Panel Data へ入れない
- 16:9 は overlay 上の CSS ピクセル見た目であり、相対座標 `width / height` の比ではない
- Undo / Redo 履歴はメモリ上のみとする。永続化しない
- 選択フレームの移動・リサイズ・aspect lock 変更は履歴に入れない
- Cut の作成・削除・番号/尺・所属変更の Undo / Redo は M5.3 の対象外とする
- 秒+コマは表示専用とする。`startFrame` の数値入力は整数 frame のままとする
- frame → 秒+コマの変換は `duration.js` に置き、Timeline / Rush 側へ変換式を重複して書かない
- Motion を Panel / Cut / Timeline のフィールドへ足さない
- `rush-player.js` の globalFrame → Cut → localFrame → panelId は維持する。画像描画と Motion 補間は入れない
- Rush と MP4 の 1 フレーム描画は共通の Frame Renderer に置く。M6 ではエンコードしない。M7 で MP4 にする
- Motion の x / y は Panel 画像内の正規化座標である。PDF 上の Panel.x / Panel.y と混ぜない
- M6 の出力窓は 16:9 とする。PDF 選択フレームの「見た目 16:9」（CSS ピクセル）とは定義が違う
- M7 の MP4 解像度は固定 1280×720 とする。Rush プレビュー canvas の CSS サイズや `devicePixelRatio` は使わない
- M7 は `FRAMES_PER_SECOND` を正とする。24 を再定義しない
- M7 は WebCodecs で映像をエンコードし、Mediabunny で MP4 へ mux する。deprecated な `mp4-muxer` と ffmpeg.wasm は第一候補にしない
- M7 では Panel / Cut / Timeline / Motion の保存フィールドを増やさない
- M8 では Timeline placement に `id` を足す。Cut / Panel / Motion の保存フィールドは増やさない。同一 `panelId` の複数 placement を許す。一意性は `startFrame` とする
- M8 の Repeat は placements を生成する編集コマンドである。Rush / MP4 に Repeat 状態を持たせない
- M10: Panel 画像は Provider 経由だけ取得する。`cropPanelImage` を Rush / MP4 / Motion へ増殖させない
- M10: drawing / upload に PDF 矩形のダミー値を入れない。`"manual"` は PDF crop のまま
- M10: 手描きの正本解像度は 1280×720。CSS サイズと `devicePixelRatio` を正本にしない
- M10: お絵描きソフト化しない（色、レイヤー、図形、テキスト、筆圧なし）

## M0 で実装する機能（実装済み）

### 1. PDF ファイル選択

- ファイル選択 UI を提供する
- 受け付ける種別は PDF（`application/pdf`）とする
- 未選択の状態では、PDF は表示しない

### 2. ローカル PDF の読み込み

- 選択された `File` をブラウザのメモリ上で読み込む
- 読み込み成功後、PDF ドキュメントとして保持する
- 読み込み失敗時は、画面上に失敗したことが分かるメッセージを出す

### 3. 1ページ目の描画

- 読み込み成功後、1ページ目を `<canvas>` に描画する
- ページ番号は 1 始まりとする

### 4. ページ移動

- 「前ページ」操作で、現在ページを 1 減らす
- 「次ページ」操作で、現在ページを 1 増やす
- 1ページ目では「前ページ」を無効にする
- 最終ページでは「次ページ」を無効にする
- PDF 未読み込み時は、ページ移動操作を無効にする

### 5. ページ情報の表示

- 現在ページ番号と総ページ数を表示する
- 表示形式は `現在ページ / 総ページ数` とする
- PDF 未読み込み時は、ページ情報を出さないか、未選択であることが分かる表示にする

### 6. 別 PDF の再選択

- ファイルを選び直せる
- 新しい PDF の読み込みに成功したら、直前のドキュメントは破棄する
- 現在ページは 1 に戻す
- 新しい PDF の 1ページ目を描画する

### 7. 外部送信をしない

- PDF バイト列を `fetch`、フォーム送信、外部 API 呼び出しで送らない
- PDF.js ワーカーへ渡すデータは、同一ブラウザ内の転送に限る

## M1 で実装する機能（実装済み）

PDF 表示中にだけ有効とする。未選択・読み込み中は Panel 操作をしない。

### 1. Panel 登録

- PDF 表示領域上でポインタをドラッグして矩形を指定する
- ドラッグ中は選択中の矩形を視覚表示する
- ドラッグ終了で Panel を確定し、登録する
- 登録時の `source` は `"manual"` とする
- 相対幅または相対高さが `0.01` 未満の矩形は誤操作とみなし、登録しない
- これはファイルをウィンドウへドロップして開く操作ではない

### 2. 登録済み Panel のページ上表示

- 現在ページに属する Panel だけを、PDF 上の矩形オーバーレイとして表示する
- PDF の canvas には描画しない。操作レイヤーに重ねる
- ページ移動後は、移動先ページの Panel だけを表示する
- ウィンドウリサイズ後も、相対座標から同じ位置を再現する

### 3. Panel 一覧

- 登録済みの全 Panel を一覧表示する
- 各行にページ番号が分かる表示と、削除操作を置く
- 現在ページに属する行は、他と区別できる見た目にする
- 表示順は次で固定する。ソート UI やフィルタ UI は置かない
  - `pageNumber` の昇順
  - 同一ページ内では登録順
- 全件数と、現在ページの件数を表示する

### 4. Panel 削除

- 一覧から登録済み Panel を削除できる
- 削除後は、ページ上の枠と一覧を更新する
- リサイズ、移動、Undo / Redo はしない

### 5. PDF 再選択時のクリア

- 新しい PDF の読み込みに成功したら、Panel をすべて破棄する
- 新しい PDF の読み込みに失敗し、直前の PDF を表示し続ける場合は、Panel を残す
- プロジェクト保存、リロード後の復元はしない

### 6. 座標

- Panel の位置と大きさは、canvas の実ピクセルではなく、ページ表示矩形に対する相対値（0〜1）で持つ
- 原点は表示上の左上、右が x+、下が y+ とする
- PDF の MediaBox や下原点のユーザー空間は使わない

## M2 で実装する機能（実装済み）

M1 の Panel 座標を使い、PDF から矩形範囲の画像を得る。確認用プレビューが目的である。

### 1. 画像の切り出し

- 表示中の PDF canvas を CSS 座標で切り抜かない
- 表示用とは別の canvas に、対象ページを PDF.js で描画する
- 描画倍率はウィンドウサイズや `devicePixelRatio` に依存しない固定値とする
- Panel の `x`, `y`, `width`, `height`（0〜1、左上原点）で描画結果から矩形を切り出す
- 切り出し処理は Panel データとは別モジュールに置く

### 2. 表示していないページ

- `panel.pageNumber` のページを直接描画する
- サムネイル生成のために `currentPage` を切り替えない
- 表示用 viewer の canvas と renderTask を使わない

### 3. サムネイル表示

- 既存の Panel 一覧の各行に、確認用サムネイルを足す
- 豪華なギャラリー UI は置かない
- 絵や文字がある程度読める品質とする
- 解析用の高解像度画像は作らない

### 4. 生成タイミングとキャッシュ

- Panel 登録直後に、非同期で切り出しを開始する
- 一覧の再描画のたびに PDF を描き直さない
- 同じ Panel `id` のプレビューはメモリキャッシュを使う
- キャッシュは Panel オブジェクトのフィールドにしない
- 切り出し処理とキャッシュは別モジュールにする
- 永続保存はしない

### 5. 破棄

- Panel を削除したら、そのサムネイルキャッシュも破棄する
- 生成中に Panel が削除されたら、完了結果は捨てる
- 新しい PDF の読み込み成功時は、全 Panel と全サムネイルキャッシュを破棄する
- 読み込み失敗で直前の PDF を維持する場合は、キャッシュも残す

### 6. 副作用の禁止

- ウィンドウリサイズでサムネイルを再生成しない
- PDF ページ表示を、切り出しのために変更しない

## M3 で実装する機能（実装済み）

人手で Cut を登録する。OCR は使わない。Cut 内の時間配置は Timeline に残す。

### 1. Cut の作成

- Panel 一覧で 1 件以上を選択する
- CUT 番号と総尺を入力する
- 選択中 Panel の `id` を `panelIds` に入れた Cut を作る
- `panelIds` の順は、作成時点の Panel 一覧順（選択されたものだけ）。再生順ではない
- 作成後、Panel の選択は解除する

### 2. CUT 番号（`cutNumber`）

- 文字列として扱う
- ユーザーが入力した表記を、基本的にそのまま保持する
- 同一セッション内で、完全一致する `cutNumber` の重複は許可しない
- `"001"` と `"001A"` は別 CUT として扱える
- 大文字小文字変換、ゼロ埋め、数値化などの自動正規化は行わない
- OCR や自動認識はしない

### 3. 総尺

- 正規の保存値は `durationFrames`（正の整数）のみとする
- 秒とコマを別フィールドとしては保存しない
- 入力は秒（0 以上の整数）とコマ（0〜23 の整数）
- 換算は `durationFrames = 秒 * 24 + コマ`（[DECISIONS.md](DECISIONS.md) の D16）
- `0+0` は拒否する
- 表示は `3+12（84f）` のように、入力形と総フレームを両方出す
- 編集時は `durationFrames` から秒とコマへ戻す

### 4. 複数 Panel の所属

- 1 つの Cut に複数 Panel を入れてよい
- M3 が表すのは「この Panel 群がこの Cut に属している」ことまでである
- 1 つの Panel は、高々 1 つの Cut に属する
- 既に別 Cut に属する Panel を追加しようとしたら、拒否して画面に理由を出す
- 同一 Cut の `panelIds` に同じ id を重ねない
- 作成時は `panelIds` を 1 件以上にする
- あとから外して 0 件になっても、Cut（番号と尺）は残してよい
- `panelIds` の並べ替え UI は置かない
- 各 Panel の開始フレーム、終了フレーム、表示区間、切替タイミングは持たない

### 5. Cut 一覧

- 登録済みの全 Cut を一覧表示する
- 各行に CUT 番号、総尺、所属 Panel 数が分かる表示を置く
- 所属 Panel は、可能なら M2 のサムネイルキャッシュを参照して示す。無ければ id で足りる
- 並びは登録順とする。ソート UI は置かない

### 6. Cut の編集と削除

- `cutNumber` と総尺を変更できる。番号の重複は拒否する
- Cut へ Panel を追加できる。Cut から Panel を外せる（Panel 自体は消えない）
- Cut を削除しても Panel とサムネイルは残す

### 7. Panel 削除時

- 既存の Panel 削除に加え、すべての Cut の `panelIds` からその id を除く
- サムネイルキャッシュの破棄は M2 どおりとする

### 8. PDF 再選択時

- 新しい PDF の読み込み成功時は、Panel・サムネイルキャッシュ・Cut をすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は、Cut も残す

## M4 で実装する機能（実装済み）

Cut 内の開始フレームを人手で置く。再生はしない。`endFrame` は保存しない。

### 1. Timeline Data

- Cut 1 件につき Timeline は 0 または 1 件とする。キーは `cutId` とする。Timeline 独自の id は持たない
- Cut 本体へ `startFrame` や `placements` を埋め込まない
- 保存するのは `cutId` と `placements`（`panelId` と `startFrame`）だけとする
- `endFrame`、トランジション、カメラワークは持たない
- `placements` の扱い順は `startFrame` 昇順とする。追加順でも `panelIds` 順でもない
- 同一 `panelId` の placement は、1 つの Timeline 内で高々 1 件とする
- Cut に対して Timeline がまだ無い状態を許す（M3 までに作った Cut など）
- 不均等な開始（例: 0 / 18 / 49）は、検証を満たせば許可する。均等自動割りはしない

例:

```json
{
  "cutId": "cut-001",
  "placements": [
    { "panelId": "panel-a", "startFrame": 0 },
    { "panelId": "panel-b", "startFrame": 36 },
    { "panelId": "panel-c", "startFrame": 60 }
  ]
}
```

### 2. startFrame

- 0 始まりの整数（フレーム）
- `0 ≤ startFrame < cut.durationFrames`
- 同一 Cut 内で同じ `startFrame` を複数 Panel が持ってはならない
- 同一 Cut 内で同じ Panel の placement は高々 1 件とする
- 空、小数、負、総尺以上、他 Panel と同じ開始、所属外の Panel は拒否し、画面に理由を出す
- 入力はフレーム数値とする。秒+コマにはしない（総尺だけ M3 の `3+12`）

### 3. 表示区間の導出

- `endFrame` は保存しない
- `placements` を `startFrame` 昇順に並べる
- i 番目の表示終了（排他）は、次の `startFrame`。最後は `durationFrames`
- 表示は `startFrame` から終了-1 までとする
- 例: 84f で 0 / 36 / 60 なら `0–35f`、`36–59f`、`60–83f`

### 4. 所属との関係

- 配置できるのは、その Cut の `panelIds` に含まれる Panel だけとする
- 所属 Panel はすべて配置必須とする。未配置は編集中の一時状態とし、その Timeline は未完成とする
- 配置完了の条件:
  - `panelIds` のすべてに、ちょうど 1 件の placement がある
  - いずれかが `startFrame === 0`
  - `startFrame` が整数で総尺内にあり、同一 Cut 内で重ならない
- Timeline から placement を消しても、`panelIds` からは外さない

### 5. 1 Panel Cut の初期化

M4 実装開始時点では、M3 までに作った Cut が残っていることがある。そのため `0f` 自動配置は新規作成時だけに限らない。

次のときに限り、所属 Panel が 1 件なら `{ panelId, startFrame: 0 }` を自動配置する。

- Cut を新規作成したとき、所属 Panel が 1 件
- 既存 Cut を Timeline 編集対象として初めて扱うとき、Timeline が未作成で、所属 Panel が 1 件だけ

複数 Panel の Cut には、M4 では自動配置しなかった。M5.4 の新規作成時は、所属順で総尺へ均等配置する（M5.4 節）。

既存 Timeline がある場合は、空でも配置済みでも、勝手に書き換えない。

### 6. 編集 UI

- 豪華な定規・再生ヘッド・ドラッグ配置は置かない
- Cut を選び、所属 Panel ごとに開始フレームを数値入力する
- 設定後、`0f Panel A` のような確認と、導出した表示区間を出す
- サムネイルは M2 のキャッシュを参照する。Timeline は画像を持たない

### 7. Cut 総尺の変更

- `durationFrames` の正は M3 の Cut のままとする
- 総尺を長くするのは許可する
- 総尺を短くした結果、`startFrame >= 新しい durationFrames` となる placement がある場合は、尺の変更を拒否する。placement は消さない

### 8. 所属変更との整合

- Cut から Panel を外したら、その Panel の placement も消す
- Cut に Panel を足したら、Timeline では未配置とする。既存 placement は触らない
- 0f の Panel を外しても、他を自動で 0f にはしない

### 9. 削除と PDF 再選択

- Cut 削除時は、その `cutId` の Timeline も削除する。Panel は残す
- Panel 削除時は、全 Cut の `panelIds` から外し、全 Timeline の placement からも外す
- 新しい PDF の読み込み成功時は、Panel・サムネイル・Cut・Timeline をすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は、Timeline も残す

### 10. モジュール境界

- 新規は `js/timeline-store.js` のみとする想定である
- Cut に `startFrame` や `placements` を足さない
- Rush / 再生用の空ファイルは作らない
- `duration.js` の 24fps 換算は Cut 総尺専用のままとする。`startFrame` の入力には使わない

## M5 で実装する機能（実装済み）

配置完了した Cut を登録順に連結し、24fps の静止画ラッシュとして再生する。MP4 は出力しない。Panel / Cut / Timeline の保存構造は変えない。

### 1. 再生対象

- 配置完了した Timeline を持つ Cut だけを再生する
- 判定は M4 の配置完了条件とする（`timelineStore.isComplete` 相当）
- Cut が 0 件、Timeline 未作成、未配置、`0f` なし、所属 0 件も未完成とする
- 未完成が 1 件でもあれば、Rush **全体**の再生開始を拒否する。未完成 Cut を飛ばさない
- 拒否時は、どの CUT が未完成か、何が不足しているかを画面に出す

### 2. 再生順と全体時間軸

- 再生順は Cut Store の登録順とする。CUT 番号の数値順・文字列順には並べない
- 並べ替え UI は置かない
- 各 Cut の `durationFrames` を登録順に連結し、global 区間を再生時に導出する
- global 開始 / 終了は Cut に保存しない
- 例: 84f + 48f + 72f なら、CUT 001 は global 0〜83、002 は 84〜131、003 は 132〜203。総尺は 204f

### 3. 再生用スナップショット

Play 時にだけ作る一時構造とする。ファイルへ保存しない。

- 含むもの: `totalFrames` と、登録順の segment（`cutId`、`cutNumber`、`durationFrames`、導出した `globalStart` / `globalEndExclusive`、`placements`）
- Panel / Cut / Timeline 本体へ埋め込まない
- 再生中は live の M3/M4 データを読まず、このスナップショットだけを使う

### 4. globalFrame → Cut → Panel

- `globalStart ≤ G < globalEndExclusive` の segment を選ぶ
- `localFrame = G - globalStart`
- その Cut の placements を `startFrame` 昇順に見て、`startFrame ≤ localFrame` のうち最大の開始の Panel を表示する
- 配置完了なら 0f があるため、Cut 先頭から末尾まで Panel が決まる
- Cut 境界・Panel 境界はハードカットのみとする。トランジションはない

### 5. 再生開始前の画像準備

再生中に Panel 画像が欠けることを避ける。時計は、必要画像がすべて揃ってから開始する。

1. Play を押す
2. 全 Cut の完成状態を検証する。未完成があれば再生しない
3. 再生用スナップショットを構築する
4. スナップショット内のユニークな Panel 画像を、Rush 用キャッシュへ 1 件ずつ生成する
5. 必要画像がすべて利用可能になったことを確認する
6. その時点から `performance.now()` を基準に 24fps 再生を開始する

準備中は Rush 領域に「再生準備中」「画像を準備しています」などの状態を出す。

同一 Panel は 1 回だけ生成する。キャッシュ済みで有効な画像は再利用してよい。ウィンドウリサイズでは再生成しない。

### 6. 画像生成失敗

- 1 件でも失敗したら、時計を進めず再生開始を拒否する
- どの Panel / CUT の画像準備に失敗したかが分かるエラーを出す

### 7. Rush 画像キャッシュ

- M2 の ThumbnailCache とは分離する
- 新規は `js/rush-image-cache.js` とする
- `cropPanelImage()` を Rush 用 scale（`RUSH_SCALE = 2`）で呼ぶ。`PREVIEW_SCALE` とは共有しない
- PDF 表示 canvas と `currentPage` は使わない
- Panel 削除時はその画像を破棄する
- 新しい PDF の読み込み成功時は全破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す
- M7 の MP4 素材とは定義しない。M6 でもエンコード入力ファイルとしては定義しない

### 8. 再生クロック

- fps は `duration.js` の `FRAMES_PER_SECOND`（24）のみ使う。Rush 側に 24 を再定義しない
- `setInterval(1000 / 24)` は使わない
- `requestAnimationFrame` と `performance.now()` で、経過実時間から currentFrame を求める
- `originMs = now - currentFrame * 1000 / FRAMES_PER_SECOND`
- `frame = floor((now - originMs) * FRAMES_PER_SECOND / 1000)`
- 総時間は `totalFrames / 24` 秒とする
- 自動ループはしない

### 9. Play / Pause / 先頭へ戻る

- Play: 検証 → スナップショット → 画像準備 → 時計開始
- Pause: 時計を止め、`currentFrame` を保持する
- 編集なしの Pause → Play: 画像を再生成せず、同じスナップショットと Rush 画像キャッシュでその位置から再開する
- 先頭へ戻る: `currentFrame = 0`、停止、最初の Cut の 0f Panel を表示する
- 最終フレームで停止中の Play は、先が無いので停止のままとする。先頭へ戻ってから Play する

### 10. 最終フレーム

- 最終表示フレームは `totalFrames - 1` とする
- そのフレームを 1/24 秒相当表示したあと停止する（`frame >= totalFrames` になったら `totalFrames - 1` を維持して止める）
- 最終画像を維持する

### 11. 編集との整合（dirty）

- M5 は M3/M4 データを読むだけとする。逆方向には書かない
- 再生中の編集は今の再生に使わない。dirty にする
- 停止中に Cut / Timeline / Panel が変わったら dirty とする
- dirty な次回 Play: スナップショットを再構築し、必要な Panel 画像を確認する。キャッシュ済みで有効なものは再利用し、新たに必要なものだけ生成する。`currentFrame` は 0 に戻す。準備完了後に再生開始する
- 先頭へ戻るは今のスナップショットの 0f とする。dirty の反映は次回 Play とする

### 12. 表示 UI

- PDF 表示 canvas とは別の Rush 専用プレビューを置く
- 最低限: 現在 Panel 画像、CUT 番号、Cut 内フレーム / Cut 総尺、全体フレーム / 全体総尺、先頭へ戻る / Play / Pause
- フルスクリーン、スクラブバー、再生ヘッドのドラッグは置かない

### 13. 削除と PDF 再選択

- Panel 削除時は Rush 画像キャッシュからも破棄する
- 新しい PDF の読み込み成功時は、再生を止め、スナップショットと Rush 画像キャッシュを破棄する
- 読み込み失敗で直前の PDF を維持する場合は、Rush 画像キャッシュも残す。再生は止める

### 14. モジュール境界

- 新規は `js/rush-player.js` と `js/rush-image-cache.js` とする
- `rush-player.js` は再生状態、Play / Pause / Reset、時刻 → globalFrame、globalFrame → Cut / Panel
- Panel / Cut / Timeline の保存構造は変えない
- MP4 / 音声用の空ファイルは作らない

## M5.1 で実装する機能（実装済み）

多数の Cut を扱いやすくするための UI / 操作改善である。Panel / Cut / Timeline / Rush の保存構造は変えない。Rush の再生ロジックも変えない。

### 1. ページ送りの位置

- 前へ / 次へ / ページ表示を、PDF 表示枠の**直下**へ移す
- PDF を包む `.page-stage` の下、Rush プレビューより上とする
- ページ送りのロジック（clamp、ボタン無効化、エラー時は維持）は M0 のままとする
- Rush の Play / Pause / 先頭へ戻るとは別の操作として見えるようにする

### 2. Cut 一覧の高密度化

約 100 Cut を縦スクロールで俯瞰できる密度にする。

1行に出すもの:

- CUT番号
- 尺（`3+12` 形式）
- フレーム数（例: `84f`）
- 所属 Panel 数（例: `P3`）
- Timeline の完成状態（完成 ✓ / 未完成 !）

完成状態は、描画のたびに既存の `timelineStore.isComplete(cut)` から導出する。Cut / Timeline に完成フラグは持たせない。

一覧に出さないもの:

- 大型サムネイル
- 開始フレームの入力
- 所属 Panel の付け外し UI

### 3. Cut 一覧と詳細編集ペインの分離

- 一覧は選択と俯瞰専用とする
- 詳細編集は別ペインとする。行の展開やモーダルは使わない
- 詳細ペインで扱うもの: CUT番号、尺、所属 Panel の付け外し、Timeline 編集、削除
- 一覧の1行をクリックすると、その Cut を詳細ペインの対象にする
- 対象 Cut はメモリ上の UI 状態だけとする。Cut Data には持たせない

### 4. CUT番号と尺の個別クリア

- CUT番号入力と尺入力のそれぞれに、すぐ隣の `×` を置く
- 押すとその入力だけ空にする。もう一方は残す
- Panel 選択は残す
- Cut Data は触らない。入力欄の UI 状態だけを空にする
- 新規作成フォームと編集フォームの両方に置く
- 確認ダイアログは出さない

### 5. Panel テンプレート（メモリ上の UI 状態）

前回成功した Panel の相対 `width` / `height` を、次の候補サイズとして覚える。

- 構造は `{ width, height }` のみとする。相対座標 0〜1
- Panel Data には入れない。`localStorage` にも入れない
- 新しい PDF の読み込み成功時に破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す

### 6. 登録モードの切替

- `drag`（ドラッグで矩形を描く）と `stamp`（前回サイズで置く）を明示的に切り替える
- modifier key（Shift など）前提にはしない
- テンプレートが無いときはドラッグのみとする。最初の 1 件は従来どおりドラッグする
- 最初の 1 件の登録成功後、自動では `stamp` に切り替えない。ユーザーが選ぶ
- 登録成功のたびに、その Panel の `width` / `height` でテンプレートを更新する
- 確定済み Panel の移動・リサイズは M5.1 では実装しない
- `source` は引き続き `"manual"` とする

### 7. stamp モードの候補配置

`stamp` では、PDF 上のクリックは候補矩形の**位置指定・移動にのみ**使う。

- クリック位置を候補矩形の**中心**とする
- ページ端では、矩形全体が相対座標 0〜1 に収まるようクランプする
- 候補矩形そのもののクリックでは登録確定しない
- 候補は未確定である。Panel Store にはまだ入れない

### 8. stamp の確定とキャンセル

位置指定と登録確定を分離する。

- 確定は、PDF 付近に置く専用操作「この位置で登録」だけで行う
- 破棄は「やめる」、または Esc とする
- 破棄後は候補を消し、テンプレートは残す。モードは維持してよい

### 9. 候補サイズの調整

- 幅・高さは、ページに対する **%** で表示し、% で調整する
- 相対値 `0.42` を直接入力させない
- 調整中は候補矩形の見た目を更新する
- 確定時のサイズを、次のテンプレートにする

### 10. モジュール境界

- 想定する変更ファイル: `index.html`、`css/style.css`、`js/app.js`、`js/panel-overlay.js`
- 新規の永続ストアは作らない
- Panel / Cut / Timeline / Rush の保存構造は変えない
- Rush 再生ロジック（検証、スナップショット、画像準備、クロック、dirty）は変えない

## M5.2 で実装する機能（実装済み）

保存構造を変えず、既存 Cut の編集導線を明確にし、配置済み Panel の `startFrame` を横バーのドラッグで編集する。Rush 再生ロジックは変えない。Cut に `startFrame` を足さない。Timeline に `endFrame` を保存しない。

### 1. 新規 Cut と既存 Cut 編集の分離

フォームは分けたままとする。1 つのフォームをモード切替しない。

- 新規: 見出し「新規 Cut」。送信は「この選択でCutを作成」。対象は今選んでいる Panel
- 既存: 見出し「CUT nnn を編集中」（選択中の `cutNumber`）。送信は「変更を保存」。対象は `selectedCutId` の Cut だけ
- 新規側の入力とクリアは、選択中 Cut の Store を触らない
- 既存側の入力とクリアは、保存するまで Cut Store を触らない
- エラー理由は、新規と既存で取り違えないよう、編集中の欄（Cut 詳細または Timeline 編集欄）へ出す

### 2. 既存 Cut の番号・尺の保存

選択中 Cut の現行値を詳細フォームへ表示する。

- CUT番号変更、尺変更、個別クリア、「変更を保存」ができる
- 入力途中は UI 状態だけとする
- 「変更を保存」で初めて検証し、Cut Store へ反映する
- 検証は M3 / M4 のままとする。CUT番号の完全一致重複（自分以外）、尺の 24fps、`startFrame >= 新しい durationFrames` なら尺変更を拒否
- 成功時は一覧と横 Timeline を描き直す。Rush は dirty にする

### 3. 横 Timeline の位置と構造

選択中 Cut の横バーは、左カラムに置く。ページ送りの下、Rush プレビューより上とする。

- Cut の `durationFrames` を全幅とする
- 左端ラベルは `0f`。右端ラベルは総尺（排他終端。有効な `startFrame` ではない）
- 最終有効開始は `durationFrames - 1` であり、右端より少し左に置く
- 配置済み Panel だけを、`startFrame` に対応する位置のマーカーとして出す
- マーカーの錨はサムネイル中心ではなく、開始位置の縦線とする
- マーカーには短いラベル、任意で M2 ThumbnailCache のサムネ、現在または候補の `startFrame` を出す
- 画像は Timeline Data に保存しない
- 表示区間は既存 `rangesFor` / `deriveRanges` から導出し、確認できるようにする（例: `A 0–35f`）。`endFrame` は保存しない
- 未選択時は「一覧から Cut を選んでください」とする
- 1 Panel Cut は特別なデータ形式を持たない。通常どおり `0f` にマーカー 1 つとする

### 4. frame と横位置の変換

表示（frame → x）:

- `x = (startFrame / durationFrames) * width`
- 1 フレームの幅はどれも `width / durationFrames` とする
- 右端を `durationFrames - 1` に割り当てる方式は採らない

入力（x → frame）:

- `ratio = clamp(x / width, 0, 1)`
- `startFrame = round(ratio * durationFrames)`
- そのあと `0 ≤ startFrame ≤ durationFrames - 1` にクランプする
- バーの外へドラッグした場合も、`0` または `durationFrames - 1` とする
- 総尺が `1f` のときは常に `0`
- 例: 35.6 相当 → 36f。42.2 相当 → 42f
- `startFrame` は整数のままとする

### 5. ドラッグ中と確定

対象は、すでに placement がある Panel だけとする。

- ドラッグ中は UI 上の候補位置と候補 frame だけを更新する。Timeline Store は書かない。Rush を dirty にしない
- pointerup で既存 `validatePlacement`（自分以外の重複を見る）により検証する
- 成功したら `timelineStore.updatePlacement` し、数値欄を新しい整数にし、Rush を dirty にする
- 再生中の確定結果は、M5 どおり今の再生には使わず、次回 Play から反映する

### 6. ドラッグ確定失敗時の復帰

pointerup の検証で、他 Panel と同じ `startFrame` や、その他既存 Timeline 検証違反により更新を拒否した場合:

- マーカーを元の保存済み `startFrame` 位置へ戻す
- 対応する数値 `startFrame` 入力欄も保存済み値へ戻す
- Timeline Store は変更しない
- Rush を dirty にしない
- エラー理由を Timeline 編集欄へ表示する
- ドラッグ中に表示した候補値を入力欄へ残さない
- 同じ `startFrame` を自動で空き frame へずらさない

### 7. Esc / pointercancel

ドラッグ中の Esc、または pointercancel でも、確定失敗時と同じ復帰とする。

- マーカーを保存済み位置へ戻す
- 数値欄を保存済み値へ戻す
- Timeline Store は変更しない
- Rush を dirty にしない

### 8. 0f マーカー

- `0f` のマーカーも移動できる
- 移動後に `0f` が無くなった Timeline は未完成とする
- 他 Panel を自動で `0f` へ移さない
- 完成 / 未完成は描画時に既存 `timelineStore.isComplete(cut)` から導出する

### 9. 数値入力との双方向同期

M4 の数値 `startFrame` 入力は残す。データの正は Timeline Store の `startFrame` だけとする。再生用の別値は持たない。

- ドラッグ確定成功 → その Panel の数値欄を新しい整数にする
- 数値の「配置 / 更新」成功 → 横バーのマーカーを描き直す
- ドラッグ中の数値欄は候補を出してよいが、失敗・キャンセル時は保存済み値へ戻す

### 10. 未配置 Panel

M5.2 では、未配置 Panel をバーへドロップして初回配置しない。

- 未配置はバーの外（Cut 詳細）に別リストで出す
- 初回配置は数値入力と「配置」で行う
- 配置成功後はマーカーが現れ、以降はドラッグできる
- Cut から Panel を外したら placement も消え、マーカーも消す（M4 のまま）

M5.3 でのクリック / ドラッグ初回配置と矢印キー微調整は、M5.3 節に書く。

### 11. Cut 総尺変更との同期

- 長尺化は許可する。同じ `startFrame` のまま、バーの比率だけ再計算する（例: 84f の 42f は中央付近、168f の 42f は約 1/4）
- 短縮で `startFrame >= 新しい durationFrames` の placement があれば、尺の保存自体を拒否する（M4 のまま）
- 拒否した場合、バーは古い尺のままとする

### 12. モジュール境界

- 新規は `js/timeline-editor.js` とする。frame ↔ x、マーカー描画、pointer ドラッグ、候補位置を扱う
- Store は所有しない。確定・失敗の Store 書き込みは app 側または callback 経由とする
- 想定する変更ファイル: `index.html`、`css/style.css`、`js/app.js`、`js/timeline-editor.js`
- Panel / Cut / Timeline / Rush の保存構造は変えない
- `rush-player.js` の再生ロジックは変えない。確定成功時だけ既存 `markRushDirty()` を呼ぶ

## M5.3 で実装する機能（実装済み）

保存構造を変えず、Panel 取得の標準操作を常設選択フレームへ移し、Panel 登録・削除と Timeline の `startFrame` 確定を Undo / Redo できるようにする。Rush 再生ロジックは変えない。確定済み Panel の移動・リサイズはしない。

### 1. 常設選択フレーム

PDF 上に、操作対象の選択フレームを常時 1 つ持つ。

- Panel 取得の標準操作はこのフレームとする
- 状態はメモリ上の UI だけとする。Panel Data にも `localStorage` にも入れない
- 構造は `{ x, y, width, height, aspectLocked }` とする。座標は M1 と同じ相対 0〜1
- PDF 読み込み成功後、1ページ目の表示後に初期表示する
- 初期位置はページ中央（枠の中心が 0.5, 0.5）
- 初期幅はページ表示幅の約 45%（`width = 0.45`）
- 初期高さは、overlay 上の CSS ピクセル見た目が 16:9 になる値とする
- ページ外へ出ないよう、既存の `MIN_SIZE` と矩形クランプで 0〜1 に収める
- 確定済み Panel の枠とは見た目を分ける。動かすのは選択フレームだけとする

### 2. 見た目 16:9

16:9 は相対座標の `width / height === 16/9` ではない。

overlay（ページ表示矩形）の CSS ピクセルで、選択フレームの見た目が 16:9 であることとする。

```
(width  * overlay.clientWidth)
--------------------------------  =  16 / 9
(height * overlay.clientHeight)
```

lock の再計算は、その時点の overlay 実寸を使う。PDF ページの表示アスペクトが変わらなければ、相対 `width` / `height` を保てば見た目 16:9 も保たれる。

### 3. 移動

- 枠の内部（ハンドル以外）をドラッグすると、矩形全体を移動する
- `width` / `height` は変えない
- 矩形全体が相対 0〜1 から出ないようクランプする
- pointer 操作を使う
- 確定済み Panel は動かさない
- 移動そのものは Undo 履歴に入れない

### 4. リサイズ

四隅にハンドルを置く。辺ハンドルは置かない。

- 掴んだ角を動かし、対角は固定する
- 最小サイズは既存 Panel の `MIN_SIZE`（0.01）と整合させる
- ページ外へ出ないようクランプする
- リサイズそのものは Undo 履歴に入れない

### 5. 16:9 固定

PDF 付近に「16:9を維持」を置く。初期値は ON とする。

- ON: リサイズしても見た目 16:9 を維持する
- OFF: `width` / `height` を独立に変更できる
- ON へ戻すときは、基本的に幅を維持して高さを合わせる。枠の中心は維持する
- はみ出す場合は高さを先に収め、必要なら幅を 16:9 に合わせてからクランプする
- lock の切替そのものは Undo 履歴に入れない

### 6. 画像取得

PDF 付近に「画像取得」を置く。

押した時点の選択フレームから、既存と同じ形式で Panel を作る。

```json
{
  "id": "<新規UUID>",
  "pageNumber": "<表示中ページ>",
  "x": 0.2,
  "y": 0.3,
  "width": 0.4,
  "height": 0.225,
  "source": "manual"
}
```

- Panel Data の項目は増やさない
- `source` は `"manual"` のままとする
- 登録後は既存 M2 どおりサムネイル生成へつなぐ
- 登録成功時は既存の `markRushDirty()` を呼ぶ
- PDF 非表示中は無効とする

### 7. 取得後もフレームを残す

Panel 登録成功後も、選択フレームの位置・サイズ・`aspectLocked` を消さない、初期化しない。

作業の主経路は、枠を合わせる → 画像取得 → 次のコマへ枠を移動 → 画像取得、とする。同サイズの連続取得を優先する。

### 8. ページ移動

前へ / 次へでは、選択フレームの位置・サイズ・`aspectLocked` を維持する。新ページではみ出す分だけクランプする。

初期値へ戻すのは、新しい PDF の読み込み成功時だけとする。

### 9. drag / stamp の整理

M5.1 の stamp は常設選択フレームへ統合する。M5.3 の現行 UI からは外す。

| 系統 | 役割 |
|---|---|
| 常設選択フレーム | 標準の Panel 取得 |
| 自由ドラッグ | 例外的な別サイズの取得 |

M5.3 の現行 UI から外すもの:

- 「前回サイズで置く」
- stamp 候補矩形
- 「この位置で登録」
- 「やめる」

`PanelPlaceMode` は `frame` と `drag` の 2 値とする。初期は `frame`。

drag 中は常設フレームを隠す。drag で Panel を登録したあと、常設フレームの位置・サイズをその結果へ吸い寄せない。drag 前の枠を維持する。

### 10. Undo / Redo の UI とキーボード

画面上に Undo / Redo ボタンを置く。押せないときは disabled とする。

キーボード:

- Mac: ⌘Z で Undo、⇧⌘Z で Redo
- Windows / Linux: Ctrl+Z で Undo、Ctrl+Shift+Z で Redo

`input` / `textarea` / `select` / `contenteditable` にフォーカスがあるときは、アプリ側の Undo / Redo を発火しない。文字編集の Undo を邪魔しない。

⌘Y / Ctrl+Y は必須としない。

### 11. 履歴対象

M5.3 の必須対象:

- Panel 登録（画像取得と、自由ドラッグの確定）
- Panel 削除
- Timeline の `startFrame` 変更（数値の確定成功、横バーの pointerup 成功）

対象外:

- 選択フレームの移動・リサイズ・aspect lock 変更
- 未確定のドラッグ矩形
- 横 Timeline の pointermove ごとの候補
- ページ送り、PDF フィット、Cut 一覧の選択
- Rush の Play / Pause
- Cut の作成・削除・番号/尺変更・所属の付け外し

確定に失敗した Store 更新は履歴に積まない。

新しい操作を push したら Redo 履歴を破棄する。Undo の途中で新操作した場合も、それ以降の Redo は捨てる。

### 12. 履歴モジュール

新規 `js/history.js` とする。Panel / Cut / Timeline Store は所有しない。

最低限の責務: `push` / `undo` / `redo` / `canUndo` / `canRedo` / `clear`

履歴はメモリ上のみとする。関数を永続化する必要はない。件数の上限を設けて古い履歴を捨ててよい。

1 件の形は、実行時クロージャでよい。

```js
{
  label: "Panelを追加",
  undo(),
  redo()
}
```

### 13. Panel 登録の Undo / Redo

Undo:

- Panel Store から削除する
- ThumbnailCache を破棄する
- Rush 画像キャッシュがあれば破棄する
- 非同期生成中なら、完了結果が復活しないように既存の世代管理で捨てる
- Rush を dirty にする
- 主ケースはまだ Cut に所属していない Panel とする。所属していれば現行の Panel 削除と同じく Cut / Timeline からも外す

Redo:

- 新しい Panel id は発行しない
- 登録時と同じ Panel id で復元する
- サムネイルは再生成してよい
- Rush を dirty にする

同じ id で戻すため、`panel-store.js` に既存 id での復元や指定位置への挿入 API を足してよい。Panel Data のフィールドは増やさない。

### 14. Panel 削除の Undo / Redo

削除を履歴へ積むときは、削除前の関連状態を 1 つの Action として保持する。

最低限保持するもの:

- Panel Data 全体
- Panel Store 上の元の挿入位置（追加順）
- 所属していた Cut（無ければ無し）
- その Cut 内での `panelIds` の位置
- Timeline placement があった場合の `startFrame`

Undo:

1. 同じ Panel id で Panel を復元する
2. 元の Cut 所属を復元する
3. 元の所属順を可能な範囲で復元する
4. Timeline placement があった場合は元の `startFrame` へ復元する
5. サムネイルを再生成する
6. Rush を dirty にする

Panel だけ戻り、Cut 所属や Timeline が消えた状態にはしない。

Redo では、同じ Panel を再度削除する（現行の Panel 削除と同じ副作用）。

### 15. Timeline `startFrame` の Undo / Redo

確定成功した 1 操作を 1 履歴とする。例: `36f → 42f`

- Undo: `42 → 36`
- Redo: `36 → 42`

横 Timeline ドラッグでも数値入力でも、Store 更新が成功したときだけ積む。pointermove ごとには積まない。

Undo / Redo 成功時は Rush を dirty にする。既存の `updatePlacement` を使う。検証に失敗したらその操作は中断し、理由を Timeline 欄へ出す。

### 16. PDF 再選択

新しい PDF の読み込み成功時:

- Undo 履歴と Redo 履歴を `clear` する
- 常設選択フレームを初期状態へ戻す

読み込み失敗で直前の PDF を維持する場合は、履歴も選択フレームも維持する。

### 17. Rush dirty

`rush-player.js` は変えない。履歴対象の確定操作とその Undo / Redo のあと、既存 `markRushDirty()` を呼ぶ。

選択フレームの移動・リサイズ・lock では dirty にしない。

Redo で Panel が戻ったら、Thumbnail は再生成し、Rush 画像は dirty な次回 Play で不足分だけ作る（M5 のまま）。

### 18. モジュール境界

- 新規は `js/history.js` とする
- 想定する変更ファイル: `index.html`、`css/style.css`、`js/app.js`、`js/panel-overlay.js`、`js/panel-store.js`、`js/history.js`、`js/timeline-editor.js`
- 選択フレームの正本は `js/panel-overlay.js` が持つ。`app.js` は `{ x, y, width, height, aspectLocked }` の複製を持たない
- overlay の公開 API は `getFrame` / `resetFrame` / `clampFrame` / `setAspectLocked` / `setMode` / `setEnabled` / `renderPanels` / `clear` とする。汎用の `setFrame` は置かない
- `js/timeline-store.js` / `js/cut-store.js` の保存項目は増やさない。削除 Undo 用のスナップショットは履歴 Action が持つ
- Panel / Cut / Timeline / Rush の保存構造は変えない
- `rush-player.js` の再生ロジックは変えない

### 19. 画面高さ

M5.3 の情報量を 1 画面に押し込まない。`html` / `body` を `100vh + overflow: hidden` の固定シェルにしない。

- コンテンツが画面高さを超えたら、ページ全体を縦スクロールする
- PDF / 横 Timeline / Rush / Cut 詳細 / Timeline 詳細のどれも、スクロールすれば到達できる
- Cut 一覧（および Panel 一覧）だけ、従来どおり領域内スクロールとする
- PDF viewer は `min(52vh, 38rem)` に収め、ページ全体を viewer が占有して下部を永久に隠さない
- 左右カラムそれぞれと内部領域を二重・三重にスクロールさせない

### 20. 複数 Panel の Timeline 操作

数値「配置」は残す。加えて次を行う。

- 未配置 Panel を選び、横 Timeline 上をクリック、または Timeline 上へドラッグする
- その位置を整数 frame へスナップし、検証成功時だけ初回 placement を作る
- 配置済みマーカーをクリックして選ぶ。選んでいるときだけ `← / →` で 1f、`Shift + ← / →` で 5f 動かす
- マーカーが選ばれていないときは、矢印キーを Timeline 編集に使わない
- 有効範囲は `0 ... durationFrames - 1`。同じ `startFrame` は禁止。無効位置は拒否して元の値を維持する
- 空き frame へ自動ではずらさない。`0f` が無くなれば未完成。他 Panel を自動で `0f` へしない
- Store 更新成功時だけ `markRushDirty()` する。保存構造は変えない

## M5.4 で実装する機能（実装済み）

保存構造と Rush 再生ロジックを変えず、整数 frame の表示を Cut 総尺と同じ「秒+コマ / 総フレーム」併記にする。秒+コマは表示専用である。`startFrame` の入力方式、横 Timeline のドラッグ、矢印キー、Timeline Store、Rush 再生ロジックは変えない。

### 1. 正と表示

- 保存と編集の正は整数 frame とする。例: `startFrame = 42` は 42 のまま
- 秒やコマを別フィールドとしては保存しない
- 表示は秒+コマを主、総フレームを補助とする。例: `1+18（42f）`
- 24fps 定数は `duration.js` の `FRAMES_PER_SECOND` のみとする。M5.4 側へ 24 を再定義しない

換算（既存 `framesToParts` と同じ）:

```
seconds = floor(frame / FRAMES_PER_SECOND)
frames  = frame % FRAMES_PER_SECOND
```

| frame | 秒+コマ |
|---|---|
| 0 | 0+00 |
| 18 | 0+18 |
| 24 | 1+00 |
| 42 | 1+18 |
| 60 | 2+12 |
| 83 | 3+11 |
| 84 | 3+12（総尺。有効な `startFrame` ではない） |

### 2. 共通 formatter

`js/duration.js` に置き、既存関数へ委譲する。Timeline / Rush へ変換式を書かない。

- `formatFrameTime(frame)` → 既存 `formatDuration(frame)`。例: `"1+18"`
- `formatFrameTimeLabel(frame)` → 既存 `formatDurationLabel(frame)`。例: `"1+18（42f）"`
- `formatFrameRange(startFrame, lastFrame)` → `"1+12–2+11（36–59f）"` のように、秒+コマを主、括弧内を inclusive の整数区間とする

`parseDurationInput` は Cut 総尺入力専用のままとする。M5.4 では `startFrame` 入力に使わない。`parseStartFrameInput` は整数のまま `timeline-store.js` とする。

### 3. Timeline 配置済み Panel

行の開始表示は `formatFrameTimeLabel` とする。

```
Panel B
1+18（42f）
```

### 4. 横 Timeline マーカー

カードは 2 段とする。ドラッグ中の候補も同じ形式で更新する。

```
1+18
42f
```

- 主: `formatFrameTime(startFrame)`
- 副: `{startFrame}f`
- `title` は `formatFrameTimeLabel`（例: `p.1 1+18（42f）`）

### 5. 数値 startFrame 入力

入力方式は変えない。整数 frame、横バーのクリック / ドラッグ初回配置、配置済みのドラッグ、`← / →` = 1f、`Shift + ← / →` = 5f を維持する。

未配置・配置済みとも、入力値が有効な整数のときだけ補助を出す。

```
start [ 42 ] f
= 1+18
```

空、非整数、`1+18` のような秒+コマ文字列は換算しない。補助を消す。エラー理由は整数 frame のままでよい。

### 6. 導出表示区間

導出ロジックは M4 のままとする。`endFrame` は保存しない。表示する終了は inclusive の最終 frame（次開始または総尺の排他終端 − 1）とする。

```
Panel A  0+00–1+11（0–35f）
Panel B  1+12–2+11（36–59f）
Panel C  2+12–3+11（60–83f）
```

横バー下の区間リストと Timeline 詳細の区間を同じ形式にする。1 行とし、秒+コマを主、括弧内を frame 補助とする。

### 7. Cut 総尺と定規

Cut 総尺の表示は既存どおり `3+12（84f）`（`formatDurationLabel`）を維持する。開始位置の秒+コマも同じ換算とする。

横バーの定規:

- 左端は有効開始 `0`。`0+00` と `0f` を併記する
- 右端は排他の総尺。有効な `startFrame` ではない。84f なら `3+12` と `84f`（`3+11` にはしない）

Cut 一覧の `3+12` と `84f` の別カラムは、高密度表示のためそのままとしてよい。

### 8. Rush メーター

`rush-player.js` は変えない。スナップショットと `localFrame` / `globalFrame` の整数はそのまま使い、`app.js` の表示だけを替える。

Local は現在 Cut 内、Global はラッシュ全体とする。ラベルを省略せず、混同しない。

```
CUT 003
Local  1+18 / 3+12
       42f / 84f
Global 12+06 / 25+00
       294f / 600f
```

- Local: 現在 Cut の位置 / その Cut の総尺
- Global: ラッシュ全体の位置 / 全体の総尺
- 秒+コマは `formatFrameTime`、frame は整数の正

Play / Pause / dirty / 画像準備は変えない。

### 9. 変えないもの

- Panel / Cut / Timeline / Rush Playback の保存構造
- `rush-player.js` の再生ロジック
- 整数 frame の数値入力、横バー操作、矢印キー
- 秒+コマ形式による `startFrame` 直接入力（将来の余地は残すが M5.4 ではやらない）
- 既存 Cut の placement を、Panel 追加のたびに再均等しないこと

### 10. モジュール境界

- formatter の追加先は `js/duration.js`
- 表示の差替えは `js/app.js`、`js/timeline-editor.js`、`css/style.css`、`index.html`
- 新規 Cut の均等配置計算は `js/timeline-store.js` の `evenPlacements`。保存項目は増やさない
- `js/rush-player.js` は変えない
- Panel / Cut / Timeline / Rush の保存構造は変えない

### 11. 完成条件

- `startFrame = 42` が `1+18（42f）` として読める
- 横マーカーで秒+コマと `42f` を確認できる
- 数値 frame 入力は従来どおり使える
- 有効な入力値の秒+コマ換算を補助表示できる
- 導出区間が秒+コマと inclusive frame で読める
- Cut 総尺と開始位置の換算が同じである
- 保存値は整数 frame のままである
- Timeline Store の保存項目と Rush 再生ロジックを変えていない

### 12. Cut 新規作成時の均等配置

Cut 作成成功時、所属 Panel が 1 件以上なら、`panelIds` の登録順で総尺へ均等配置する。

```
startFrame(i) = floor(durationFrames * i / panelCount)
```

`i` は 0 始まり。1 Panel なら従来どおり `0f`。例: 84f / 3 Panel なら `0` / `28` / `56`。

- 保存するのは既存の `{ panelId, startFrame }` だけとする
- `0 ≤ startFrame < durationFrames`。同一 `startFrame` は置かない
- 総尺が短く異なる開始を作れないとき（例: `durationFrames < panelCount`）は自動配置しない。Timeline は未完成のまま、理由を Timeline 欄へ出す
- 既存 Cut へ Panel を足したときは、既存 placement を再均等しない。追加分は未配置とする
- Cut 作成の Undo / Redo は足さない

## M6 で実装する機能（実装済み）

静止画ラッシュへ、最低限のカメラワーク（PAN / TU / TB）を足す。ブラウザ Rush 上で Motion が見えるところまでとする。MP4 / WebM は出さない。Panel / Cut / Timeline の保存項目は変えない。

### 1. 責務の境界

| 境界 | 役割 | M6 で触るか |
|---|---|---|
| Panel | PDF 上の画像領域 | フィールドは増やさない |
| Cut | CUT 番号、総尺、所属 Panel | フィールドは増やさない |
| Timeline | 各 Panel の `startFrame` | フィールドは増やさない。表示区間の導出は既存 `deriveRanges` |
| Motion | Panel 表示中に、16:9 出力へどこを crop するか | **新規**。独立 Store |
| Rush | 時間軸に沿った再生 | player の時刻解決は維持。描画だけ Renderer へ移す |

Motion は「Panel を平行移動する」データではない。最終出力フレームに対する crop 窓である。

### 2. Motion Data

Cut 1 件につき Motion 集合は 0 または 1 件。Timeline と同様、独自 id は持たない。キーは `cutId`。

```json
{
  "cutId": "cut-001",
  "motions": [
    {
      "panelId": "panel-a",
      "from": { "x": 0.3, "y": 0.5, "scale": 1.0 },
      "to": { "x": 0.7, "y": 0.5, "scale": 1.4 }
    }
  ]
}
```

保存する項目だけ:

| 項目 | 意味 |
|---|---|
| `cutId` | 対象 Cut |
| `motions[].panelId` | その Cut 所属の Panel |
| `motions[].from` | 表示区間の先頭 frame の画角 |
| `motions[].to` | 表示区間の最終 frame（inclusive）の画角 |
| `from` / `to` の `x` | Panel **画像**内の viewport 中心 X（0〜1） |
| `from` / `to` の `y` | Panel **画像**内の viewport 中心 Y（0〜1）。下が + |
| `from` / `to` の `scale` | ズーム。`1.0` は Panel 内に収まる最大 16:9。大きいほど狭い（寄る） |

持たないもの（M6）:

- `type`（PAN / TU / TB は from/to から表示用に導出する。正本にしない）
- `startFrame` / `endFrameExclusive`（時間は Timeline 表示区間に従属させる）
- 回転、ease、出力ピクセルサイズ、PDF ページ座標

制約:

- 同一 Cut 内で同じ `panelId` は高々 1 件（配列なのは将来の複数 Motions 用）
- `panelId` はその Cut の `panelIds` に含まれるものだけ
- `x` / `y` は有限数で 0〜1。`scale` は有限数で `>= 1`
- viewport は常に Panel 画像の内側に収まる。はみ出す中心は保存時にクランプする
- Motion が無い Panel は正常。全 Panel に作る必要はない

### 3. PAN / TU / TB の統一表現

正本は `from` / `to` の `x` / `y` / `scale` だけとする。type を排他の `"pan" | "tu" | "tb"` にはしない。

| 見た目 | from → to の関係（表示ラベル） |
|---|---|
| PAN | 位置が変わり、scale はほぼ同じ |
| TU | scale が増える（Zoom In。表示範囲が狭まる） |
| TB | scale が減る（Zoom Out。表示範囲が広がる） |
| PAN+TU / PAN+TB | 位置と scale が両方変わる |
| 静止画角 | from と to が同じ（寄ったまま動かない） |
| Motionなし | レコード自体が無い。M5 どおり Panel 全体を contain 表示 |

UI の「PAN / TU / TB」はプリセットである。押すと from/to の初期値を入れる。そのあと START/END 枠を動かせば組み合わせになる。ラベルは保存後に導出する。

PAN の意味: 元 Panel 画像の中を、16:9 の crop 窓が移動する。画像ビットマップを平行移動して余白を見せる操作ではない。

TU / TB の意味: 同じ 16:9 窓の大きさが時間で変わる。TU は窓が小さくなる。TB は窓が大きくなる（下限は scale 1.0）。

### 4. Motion の時間区間

M6 は案 A を採る。Motion は **その Panel の表示区間全体**にかかる。

時間は保存しない。再生・編集表示のときだけ、既存の Timeline 導出を使う。

- `startFrame` / `endExclusive` / `lastFrame` は `deriveRanges(cut, timeline)` と同じ
- 例: Panel A が 0〜47f なら、from は 0f、to は 47f
- Panel の一部だけ（12〜36f）にかけることは M6 では UI もフィールドも作らない
- 将来の部分 Motion は、同じ `from` / `to` に任意の区間フィールドを足せる余地を `motions` 配列側に残す。M6 で空の時間フィールドは置かない

1 Panel 表示区間につき Motion は高々 1 件。PAN のあと TU を繋ぐ連続 Motions は後回しとする。

Motion には表示フレームが **2 以上**必要である。`startFrame === lastFrame` のときは新規作成・編集を不可とし、「表示区間が1フレームのためMotionを設定できません」を出す。1 フレーム時の `t` 分岐は再生仕様に持たない。Motionなしの 1 フレーム Panel は contain の静止のままとする。

### 5. `x` / `y` / `scale`

PDF の Panel.x / Panel.y / width / height（ページ相対）とは別空間である。

- 原点は Panel 切り出し画像の左上。右が x+、下が y+
- `x` / `y` は **中心**。左上ではない
- `scale = 1.0`: Panel 画像に内接する、最大の 16:9 矩形（画素空間で 16:9）
- `scale = 2.0`: その矩形の幅・高さが半分（2 倍ズーム）
- `scale < 1` は M6 では禁止（Panel の外を見せない）

Panel が 16:9 なら scale 1.0 は画像全体。4:3 などでは上下または左右が crop される。

### 6. 16:9 viewport

将来の Rush / MP4 出力は 16:9 を前提とする。M6 の Motion 窓も 16:9 とする。

基本は **16:9 出力へ crop して埋める（cover）**。letterbox を Motion 中に出さない。fit（画像全体を入れて帯を出す）は Motion なしのときだけ使う。

出力のピクセル幅・高さは Motion Data に持たない。Rush プレビューと将来 MP4 が、同じ pose をそれぞれの canvas サイズへ描く。

PDF 常設選択フレームの 16:9（overlay の CSS ピクセル見た目、D53）とは定義が違う。Motion では Panel 画像の画素で `width : height = 16 : 9` とする。

### 7. Motionなし

レコードが無い Panel は M5 どおり静止表示する。

- Rush 出力 16:9 枠の中へ、Panel 画像全体を **contain**（`object-fit: contain` 相当）
- 余白は黒帯でよい
- これを scale 1.0 の center crop と同一視しない。Motionなしと「scale 1 の静止画角」は見た目が異なり得る

### 8. 線形補間

ease-in / ease-out は置かない。

適用できるのは `lastFrame > startFrame` のときに限る。

```
t = (localFrame - startFrame) / (lastFrame - startFrame)
t は 0〜1 にクランプ
pose.x = lerp(from.x, to.x, t)
pose.y = lerp(from.y, to.y, t)
pose.scale = lerp(from.scale, to.scale, t)
```

先頭 frame で from（t = 0）、inclusive 最終 frame で to（t = 1）。1 フレーム（`startFrame === lastFrame`）ではこの式を評価せず、Motion を適用しない。

M9 では `preFixFrames` / `postFixFrames` がある。補間の `startFrame` / `lastFrame` は Panel 表示区間そのものではなく、`motionStart` / `motionLast` である。preFIX は from 静止、postFIX は to 静止。共通関数は `sampleMotionOnRange`。

`localFrame` はその Cut 内 frame（`resolveFrame` が返す値）。Panel 先頭からの相対に直してから t を求める。

### 9. Timeline 変更との整合

時間を保存しないので、`startFrame` が変わっても Motion 期間は新しい表示区間へ自動で追従する。from/to 画角は触らない。

- 尺短縮で placement が総尺外になる変更は、既存どおり尺変更を拒否する。Motion を消さない
- 配置が未完成のあいだは Rush 全体が再生できない（M5 のまま）
- Timeline 変更後に表示区間が 1 フレームになった場合、Motion レコードは消さない。Rush では適用せず contain 静止とする。UI に適用不能であることを出す
- 独立 start/end を持たないため、Timeline 変更後の「区間がはみ出した Motion」は M6 では起きない

### 10. 削除と PDF 再選択

| 操作 | Motion |
|---|---|
| Panel 削除 | すべての Cut から、その `panelId` の Motion を消す |
| Cut から Panel を外す | その Cut のその `panelId` の Motion を消す。Panel Data は残る |
| Cut 削除 | その `cutId` の Motion 集合を消す |
| Timeline から placement だけ消す | Motion は残してよい（未完成。再配置後に同じ画角を使える） |
| PDF 再選択成功 | Motion 全削除 |
| 読み込み失敗で旧 PDF 維持 | Motion も維持 |

Panel 削除の Undo があるため、削除 Action は既存の Panel / 所属 / placement に加え、消した Motion も保持して戻す。

### 11. Undo / Redo

M6 の必須対象に含める（既存 `history.js` の command 形式。永続化しない）。

- Motion 作成
- Motion 削除（「Motionなし」へ戻す）
- START / END（from / to）の確定変更
- 前FIX / 後FIX（`preFixFrames` / `postFixFrames`）の確定変更

含めない:

- Cut 作成 / 削除 / 番号・尺 / 所属追加（M5.3 どおり）
- START/END 枠のドラッグ中プレビュー（確定まで Store に書かない。Timeline マーカーと同じ）
- 選択フレームの移動（既存どおり）

確定成功と、その Undo / Redo のあと `markRushDirty()` する。

### 12. 編集 UI

選択中 Cut の詳細（右カラム、Timeline の下）に Motion 欄を置く。左カラムの PDF / 横 Timeline / Rush の役割は維持する。

- 所属 Panel ごとに「Motionなし」または導出ラベル（PAN / TU / TB / PAN+TU 等）
- 選んだ Panel の切り出し画像の上に、16:9 の START 枠と END 枠を重ねる
- 枠本体ドラッグで中心移動、四隅で scale（常時 16:9、lock 解除なし）
- START / END が重なっても操作できるよう、編集対象を「STARTを編集 / ENDを編集」で切り替える。選択中だけ pointer 操作し、非選択は半透明で pointer-events 無効。初期と Panel 切替時は START。プリセット後も選択は維持する。選択状態は UI のみで保存しない
- 両枠は Panel 画像の外へ出さない
- PAN: サイズほぼ同じで位置だけ違う状態を作れる
- TU: END が START より小さい
- TB: START が END より小さい
- プリセット「Motionなし / PAN / TU / TB」を置く。なしはレコード削除

M5.3 の常設選択フレームは **PDF ページ**用のまま残す。Motion 枠は **Panel 画像**用の別 UI とする。移動・リサイズ・16:9 固定の操作感は参考にするが、`panel-overlay.js` のフレームを流用して PDF 座標と混ぜない。実装は `motion-editor.js` が描画とポインタを持ち、Store は持たない（`timeline-editor.js` と同じ）。

数値の x / y / scale 入力は必須にしない。確認用の読み取り表示はあってよい。

### 13. Rush 再生への組み込み

`rush-player.js` が決める次の流れは変えない。

```
globalFrame → Cut → localFrame → panelId
```

その後に app / Renderer が足す。

```
panelId + localFrame +（凍結した Motion / 表示区間）
  → pose または null
  → Frame Renderer
```

- Play 時、Cut / Timeline スナップショットに加え、Motion も凍結する。再生中は live の Motion Store を読まない
- Motion の凍結コピーは player の snapshot オブジェクトへ埋め込まない。app 側の再生一時状態とする
- dirty 規則は M5 と同じ。Motion 確定も dirty。次回 Play は 0f から再構築
- 画像準備は既存 Rush キャッシュのまま。Renderer はその画像をソースにする
- Rush プレビューは内部 16:9（基本 640×360。devicePixelRatio に合わせて最大 1280×720）と CSS `aspect-ratio: 16 / 9` の両方で維持する。flex で縦に引き伸ばさない
- Play 可否は従来どおり Timeline 配置完了のみ。Motion 未設定では拒否しない

### 14. Frame Renderer

新規 `js/frame-renderer.js`。描画へ専念する。

主入口:

```
renderFrame({ canvas, image, pose })
```

- `pose === null` → 16:9 canvas へ contain 静止（背景は黒）
- pose あり → 16:9 crop viewport を canvas いっぱいに描く
- `x` / `y` / `scale` → ソース矩形（画素）はここが持つ

持たないもの:

- globalFrame → Cut / Panel の解決（既存 `resolveFrame` のまま app 側）
- 線形補間（pose 解決は app / motion-store）
- Play / Pause / 時計
- PDF 読み込み
- Motion Store の所有
- MP4 / WebM エンコード

M7 はフレームごとに `resolveFrame` → pose 解決 → `renderFrame` を呼び、1280×720 のオフスクリーン canvas をエンコーダへ渡す。Renderer に MP4 も時刻も持たせない。

### 15. モジュール

| ファイル | 責務 |
|---|---|
| `js/motion-store.js` | Motion の保持、検証、削除整合、pose の線形サンプル。描画はしない |
| `js/frame-renderer.js` | viewport 幾何と `renderFrame`。時刻も Store も持たない |
| `js/motion-editor.js` | START/END 枠 UI。Store を持たない |
| `js/rush-player.js` | 時計と `resolveFrame` のみ。再生ロジックは変えない |
| `js/app.js` | Play 時の凍結、onFrame で pose 解決して `renderFrame`、削除時の Store 連携 |
| `js/panel-store.js` / `cut-store.js` / `timeline-store.js` | 保存フィールドは変えない。削除 API の呼び出し元が Motion も消す |

M6 時点では空の MP4 モジュールは作らない。M7 実装時に `js/mp4-exporter.js` と `js/export-image-cache.js` を足す。

### 16. 完成条件

- Motionなし Panel は従来どおり静止（16:9 枠へ contain）
- Panel ごとに Motion は 0 または 1 件
- PAN を START/END 位置で設定できる
- TU / TB を START/END サイズで設定できる
- PAN+TU も同じ from/to で表せる
- 24fps の各 frame で線形補間できる（最終 frame で to）
- Rush 再生で Motion が見える
- Timeline の `startFrame` 変更後も Motion 期間が破綻しない
- Panel / Cut 削除で Motion 参照が残らない
- Frame Renderer が Rush と MP4 で共用可能な入口を持つ
- M6 では MP4 自体は未実装
- Panel / Cut / Timeline の保存構造を変えていない

### 17. M6 では実装しないもの

- MP4 / WebM / 音声 / BGM / SE
- ease-in / ease-out
- 1 Panel 内の複数 Motion 連結
- 部分区間 Motion（Panel 表示の途中だけ）
- 回転 / 3D / blur / dissolve / transition
- fps 変更、23.976 / 30fps
- タイムシート、更新コンテ PDF、OCR、自動 Panel 検出
- カメラワークの自動解析

## M7（実装済み）

M6 までで確定した

PDF → Panel → Cut → Timeline → Motion → Frame Renderer → Rush

と同じ映像結果を、ブラウザ内で MP4 ファイルとして書き出す。本節が実装時の正である。

M7 では次に限定する。

- 16:9
- 24fps（既存 `FRAMES_PER_SECOND` のみ）
- 映像のみ
- MP4（H.264 / AVC）

音声、1080p 選択、bitrate UI、fps 変更、WebM / MOV、タイムシート、更新コンテ PDF、ease、transition、dissolve は対象外とする。

### 1. 技術選択

採用する。

| 層 | 担当 |
|---|---|
| 1 フレーム描画 | 既存 `js/frame-renderer.js` の `renderFrame` |
| 映像エンコード | WebCodecs の `VideoEncoder`（Mediabunny が内部で呼ぶ） |
| MP4 mux | Mediabunny の `Mp4OutputFormat` |

論理境界はユーザー要求どおり、**生フレームのエンコードは WebCodecs、コンテナ組み立ては Mediabunny** とする。

実装では Mediabunny の `CanvasSource`（または `VideoSampleSource`）を使う。これらは内部で `VideoEncoder` を持ち、SPS/PPS と MP4 の `avcC` を Mediabunny 側で扱う。M7 では自前の `VideoEncoder` + `EncodedVideoPacketSource` を第一候補にしない。理由は、codec description の組み立てを二重に持つことになるためである。capability 確認だけは開始前にアプリ側で行う。

採用しないもの:

- **`mp4-muxer`**: 作者が Mediabunny へ移行し、deprecated である
- **ffmpeg.wasm（M7 第一候補にしない）**: WASM 本体が大きく起動が重い。GitHub Pages の静的構成と合わない。WebCodecs で足りる encode+mux を二重に持つ。音声や非対応 codec のフォールバックが必要になった時点で再検討する

依存の読み方は PDF.js と同じく、**固定バージョンの jsDelivr CDN** とする。ビルド手順は増やさない。最新追従 URL（`@latest` 等）は使わない。

ピン止め: **Mediabunny `1.51.0`**（2026-07-22 公開）。実装時に jsDelivr の ESM 入口を確認する。候補:

```
https://cdn.jsdelivr.net/npm/mediabunny@1.51.0/+esm
```

`dist/modules/src/index.js` の生ツリーは相対 import の都合で GitHub Pages 向きでない可能性がある。実装着手時に `+esm` が解決することを確認し、ダメなら同バージョンのブラウザ向けバンドルを `vendor/` へ固定配置する。version 文字列は [DECISIONS.md](DECISIONS.md) の D80 を正とする。

### 2. 出力仕様

| 項目 | M7 の値 |
|---|---|
| container | MP4 |
| video | H.264 / AVC（Mediabunny codec `'avc'`） |
| profile | 第一候補はブラウザが返す AVC。希望があれば `fullCodecString: 'avc1.4D401F'`（Main 3.1、1280×720 に足りる）。Baseline `avc1.42001F` は互換優先の控え |
| fps | `FRAMES_PER_SECOND`（24）。M7 側に 24 を再定義しない |
| resolution | **1280 × 720** 固定 |
| aspect | 16:9 |
| audio | なし |
| bitrate | UI は置かない。固定。目安は 5 Mbps、または Mediabunny の `QUALITY_HIGH`。実装時に一方へ決める |
| fastStart | `BufferTarget` 利用時は moov を先頭近くへ置ける設定を使う（ダウンロード後の再生のため） |

720p / 1080p の選択 UI は後回しとする。

書き出し canvas は Rush プレビューとは別の、**常に 1280×720 のオフスクリーン canvas** とする。次を MP4 解像度にしない。

- `#rush-canvas` の CSS サイズ（640×360）
- `devicePixelRatio`
- `rushCanvasPixelSize()`（dpr 上限 2 で最大 1280×720 になるが、ウィンドウや Retina に依存する定義である）

これにより、ウィンドウサイズ・Retina 倍率・Rush プレビュー表示サイズから出力品質を切り離す。

### 3. 対応ブラウザと事前確認

WebCodecs と利用可能 codec は環境に依存する。書き出しボタンを押したあと深い処理で失敗させない。

開始前に次を確認し、非対応なら画面メッセージで止める。

1. `'VideoEncoder' in window`（なければ「このブラウザでは MP4 書き出しに未対応です」）
2. Mediabunny の `canEncodeVideo('avc', { width: 1280, height: 720 })`、または同等の `VideoEncoder.isConfigSupported`
3. 希望 profile を指定する場合は、その `fullCodecString` でも再確認する

`canEncodeVideo('avc')` のデフォルト確認解像度は Mediabunny 側で 1280×720 である。M7 の出力と同じなので、確認と実エンコードをずらさない。

Chrome / Edge を第一の動作対象とする。Safari / Firefox は WebCodecs の AVC エンコード有無が異なる。非対応はエラー表示とし、M7 で VP9/WebM へ黙って落とさない。

### 4. snapshot

書き出し開始時点の次を凍結する。書き出し途中で live の Store を読まない。

- Cut 一覧（登録順）と各 Cut の `durationFrames` / `panelIds`
- 各 Timeline の `placements`（`buildSnapshot` と同じ）
- Motion 全件（Play 時の `motionStore.listAll()` 凍結と同じ）
- 参照する Panel の `id` / `pageNumber` / `x` / `y` / `width` / `height`（rasterize に必要）
- 開いている `pdfDocument` への参照（セッション中の同一 document）
- 出力ファイル名の元になる PDF 名

編集 UI を全面 disable する必要はない。進行中 MP4 は開始時 snapshot のままとする。次回書き出しで変更を反映する。

PDF 再選択成功は `pdfDocument` を破棄する。書き出し中は **PDF ファイル選択を禁止**する。差し替えたい場合は、先に書き出しをキャンセルしてから選ぶ。書き出しを自動キャンセルして差し替えるより、禁止の方が mux 途中の破棄漏れが少ない。

### 5. frame 生成

MP4 はリアルタイムではない。`globalFrame = 0` から `totalFrames - 1` まで順番に、決定論的に生成する。

概念フロー:

```
capability 確認
→ snapshot 凍結
→ 未完成 Cut 検査（1 件でも拒否）
→ Export 用 Panel 画像の準備
→ オフスクリーン 1280×720 canvas / encoder / muxer 開始
→ for globalFrame in 0 .. totalFrames-1:
     cancel 確認
     view = resolveFrame(snapshot, globalFrame)
     pose = 既存と同じ pose 解決（Motionなし / 1フレーム区間は null）
     image = export cache
     renderFrame({ canvas: exportCanvas, image, pose })
     timestamp を frame 番号から付与してエンコード
     VideoFrame 相当は encode 後に close
     進捗通知
→ finalize → MP4 Blob → 保存
→ cache / encoder / muxer を破棄
```

生の 1280×720 RGBA を全 frame 分保持しない。1 frame 描画 → encode → close → 次 frame とする。

UI とキャンセルのため、数 frame ごと（目安 1〜8）にイベントループへ戻す。`performance.now()` は進捗表示の実時間には使ってよいが、映像 timestamp には使わない。

### 6. rush-player.js との境界

使わないもの:

- Play / Pause
- `requestAnimationFrame` 時計
- `performance.now()` 起点の経過 frame

再利用するもの（既存の純粋関数。再生仕様は変えない）:

- `inspectCuts` / `describeIncomplete`
- `buildSnapshot`
- `resolveFrame`
- `uniquePanelIds`
- `deriveRanges`（Timeline）
- `samplePose` / `canSampleMotion`（Motion）

`createRushPlayer` の時計は MP4 に接続しない。

pose 解決は M6 で `app.js` の `poseForRushView` にある。MP4 側へコピーしない。M7 実装時に、Rush 表示と exporter が同じ関数を呼ぶ小さな純粋ヘルパーへ切り出す（案: `js/frame-pose.js`、または `motion-store.js` へ `poseForResolvedFrame(snapshot, motions, view)` を足す）。切り出しは関数の移動だけとし、Rush の再生仕様（dirty、終端、rAF）は変えない。`resolveFrame` 自体は `rush-player.js` に残してよい。

### 7. Frame Renderer の再利用

PAN / TU / TB の描画式は `frame-renderer.js` にだけ置く。Rush と MP4 で二重実装しない。

MP4 は:

```
renderFrame({
  canvas: exportCanvas, // 1280×720、dpr 非依存
  image,
  pose
})
```

`pose === null`（Motionなし、または 1 フレーム表示で適用不能）は M6 と同じ contain 静止。pose ありは 16:9 crop fill。Renderer は encoder も timestamp も持たない。

### 8. VideoFrame timestamp

24fps を frame 番号から決める。実時間は使わない。

WebCodecs の timestamp は整数マイクロ秒である。1/24 秒は割り切れない。**累積がずれない整数化**を正とする。

```
timestampUs(globalFrame) =
  Math.round(globalFrame * 1_000_000 / FRAMES_PER_SECOND)

durationUs(globalFrame) =
  timestampUs(globalFrame + 1) - timestampUs(globalFrame)
```

各 frame を独立に `Math.round(1_000_000 / 24)`（41667）すると、1 秒あたり 8µs 程度の累積誤差が出る。差を duration に使うと `timestampUs(totalFrames) / 1e6` が `totalFrames / 24` 秒に一致する。

Mediabunny の `CanvasSource.add(timestampSec, durationSec)` を使う場合も、秒は上記 µs から換算するか、`globalFrame / FRAMES_PER_SECOND` を渡し、`addVideoTrack(..., { frameRate: FRAMES_PER_SECOND })` で 24fps グリッドへスナップさせる。スナップを使う場合も入力は frame 番号由来とし、`performance.now()` は渡さない。実装時に Mediabunny の `frameRate` スナップと整数 µs のどちらを実エンコーダへ渡すかを DECISIONS へ追記してよい。方針は「尺 = totalFrames / 24 秒」である。

完成 MP4 のフレーム数と尺は、snapshot の `totalFrames` および `totalFrames / FRAMES_PER_SECOND` 秒と一致させる。

### 9. keyframe

GOP 設定 UI は置かない。

- 最初の frame（globalFrame 0）は必ず keyframe
- 以降は Mediabunny の `keyFrameInterval` デフォルトに合わせ、**2 秒 = 48 frame**（`2 * FRAMES_PER_SECOND`）

`CanvasSource.add(..., { keyFrame: true })` は 0 フレーム目に使う。間隔は codec 設定の `keyFrameInterval: 2` に任せてよい。より短い GOP はファイルサイズ増のため M7 では変えない。

### 10. Export 用 Panel 画像

`RushImageCache`（`RUSH_SCALE = 2`）はプレビュー専用である。MP4 素材として定義しない。

書き出しは `cropPanelImage(pdfDocument, panel, { scale })` で、**Panel ごとに必要な PDF.js scale** を決める。720p に対して無関係に最大 scale で全ページを焼かない。

必要解像度:

Motion の crop は、Panel 画像に内接する最大 16:9（`baseViewportSize`）を `scale` で割った矩形を 1280×720 へ引き伸ばす。TU で `scale > 1` のとき、ソース矩形は小さくなる。ソース幅が出力幅以上になるように rasterize する。

Panel ごと:

1. その Panel の凍結 Motion が無ければ `motionMaxScale = 1`
2. あれば `motionMaxScale = max(from.scale, to.scale, 1)`
3. PDF.js `scale: 1` での Panel 画素サイズから `baseViewportSize` の幅 `baseWidth1` を得る
4. `pdfScale = (EXPORT_WIDTH * motionMaxScale) / baseWidth1`、下限 1
5. 上限 **`EXPORT_PDF_SCALE_CAP = 8`**（過剰 rasterize とメモリの天井）

contain のみの Panel も、内接 16:9 が 1280 幅相当になる同じ式（`motionMaxScale = 1`）で足りる。TU の最大 scale を見て、その Panel だけ pdfScale を上げる。全 Panel に作品内の最大 TU を一律適用しない。

上限に当たった Panel は、最大ズーム付近が 720p よりやや粗い。画面エラーにはせず、想定リスクとする。

### 11. Export image cache

新規 `js/export-image-cache.js`。`RushImageCache` とは分離する。

| | Rush | Export |
|---|---|---|
| 用途 | プレビュー | 720p 動画素材 |
| scale | 固定 `RUSH_SCALE = 2` | Panel ごとの必要 pdfScale |
| 寿命 | PDF セッション | **1 回の書き出し** |

寿命は **書き出し開始〜完了 / キャンセル / 失敗** とする。完了後は破棄する。PDF セッション中の再利用は M7 ではしない。

理由:

- TU 付き Panel は数枚で数十 MB になり得る。セッション常駐は長尺で危険
- 書き出しのたびに Motion の最大 scale が変わり得る
- 準備失敗をエンコード前に確定できる（Rush と同じ「先に全ユニーク Panel」）

準備は `uniquePanelIds(snapshot)` を 1 件ずつ。失敗した Panel で中断し、画面に出す。エンコード中に PDF を再 rasterize しない。

### 12. モジュール

| ファイル | 責務 |
|---|---|
| `js/mp4-exporter.js` | capability、snapshot 受け取り、frame ループ、encode/mux 駆動、progress、cancel、Blob。描画式・Store 所有・Rush 時計は持たない |
| `js/export-image-cache.js` | 書き出し用 `cropPanelImage` と破棄 |
| `js/frame-pose.js`（任意） | Rush と MP4 で共用する pose 解決。再生時計は持たない |
| `js/frame-renderer.js` | 変更しないことが理想。canvas サイズは呼び出し側が 1280×720 にする |
| `js/rush-player.js` | `buildSnapshot` / `resolveFrame` を export したまま。Play 仕様は変えない |
| `js/duration.js` | `FRAMES_PER_SECOND` のみが fps の正 |
| `js/app.js` | ボタン、進捗表示、PDF 選択ロック、保存トリガ。encoder 内部は持たない |

`mp4-exporter.js` が持たないもの:

- PAN/TU/TB の画素計算（`renderFrame` へ委譲）
- Panel / Cut / Timeline / Motion Store の所有
- Rush の Play / Pause

### 13. encoder / muxer の責務

| | 担当 |
|---|---|
| app | 未完成 Cut 検査、PDF ロック、UI、Blob 保存 |
| export-image-cache | Panel 画像 |
| frame-renderer | 1 枚の見た目 |
| Mediabunny CanvasSource + WebCodecs | 1280×720 の AVC エンコード、keyframe 間隔 |
| Mediabunny `Output` + `Mp4OutputFormat` + `BufferTarget` | MP4 コンテナ、最終 `ArrayBuffer` / Blob |

muxer は音声トラックを足さない。M8 で同じ `Output` に audio track を足せる余地は残す（API を閉じない）が、M7 では呼ばない。

### 14. UI

Rush 付近に最低限:

- `[ MP4を書き出す ]`
- 書き出し中は `[ キャンセル ]`
- 状態テキスト

状態:

| 状態 | 表示例 |
|---|---|
| 準備中 | `準備中（画像 3 / 12）` |
| エンコード中 | `エンコード中 842 / 2400f（35%）` |
| 完了 | `書き出し完了`（保存ダイアログ後） |
| キャンセル | `書き出しをキャンセルしました` |
| エラー | 理由を 1 メッセージ |

% は `Math.floor(100 * current / total)`。total 0 は起きない（未完成または空は開始前に拒否）。

書き出し中は書き出しボタンを無効化する。Play との同時実行は禁止する（Play 中なら書き出さない / 書き出し中は Play しない）。編集 UI は動かしてよい。

### 15. キャンセル

M7 に含める。UI はボタン 1 つに留める。

- 次の frame 生成前に cancel flag を見る
- 画像準備の 1 Panel ごとにも見る
- encoder / muxer / export cache / VideoFrame を破棄する
- 部分 MP4 は保存しない
- `BufferTarget` のバッファも捨てる

### 16. ファイル保存

完成した MP4 はブラウザ内の Blob だけとする。サーバーへアップロードしない。PDF と同様、ローカルで完結する。

保存は `<a download>` または `showSaveFilePicker`（あれば）。未対応ブラウザは download 属性で足りる。

ファイル名:

**第一候補: `<PDFのベース名>-rush.mp4`**

絵コンテ PDF が作品の正本なので、書き出しもその名に紐づける方が自然である。拡張子を除き、パス区切りと Windows 禁則文字は `_` へ置換する。空や不明なときだけ **`conte-rush-YYYYMMDD-HHMM.mp4`** に落とす。

両方をユーザー選択にする UI は M7 では置かない。

### 17. 未完成 Cut

Rush の Play と同じ。`inspectCuts` で 1 件でも未完成なら、全体を拒否する。未完成 Cut を飛ばして書き出さない。

Motion 未設定は正常。1 フレーム Panel の Motion 適用不能は M6 どおり contain 静止（`canSampleMotion` が false なら pose なし）。

Cut が 0 件、または `totalFrames < 1` も開始前に拒否する。

### 18. エラー処理

コンソールだけにしない。画面に出す境界:

| 条件 | メッセージの趣旨 |
|---|---|
| `VideoEncoder` なし | このブラウザでは MP4 書き出しに未対応 |
| AVC 1280×720 をエンコードできない | この環境では H.264 書き出しに未対応 |
| 未完成 Cut | Rush と同様、件名と理由 |
| PDF が無い / document 破棄 | 書き出せない |
| Panel 画像生成失敗 | どの Panel / Cut か分かる範囲で |
| encoder error | エンコードに失敗した |
| muxer error | MP4 の組み立てに失敗した |
| メモリ不足等の例外 | 書き出しに失敗した（原文を短く添えてよい） |
| 書き出し中の PDF 選択 | 書き出し中は PDF を差し替えできません |

### 19. メモリ

保持してよいもの:

- オフスクリーン canvas 1 枚（1280×720 ≈ 3.7 MB）
- 進行中の VideoFrame / VideoSample 高々 1〜数枚。encode 後 `close()`
- Export 用 Panel 画像（ユニーク Panel 数。書き出し終了で破棄）
- mux 中の MP4 バッファ（`BufferTarget`）。**最終 Blob をメモリに持つことは M7 で許容**

保持してはいけないもの:

- 全 frame の RGBA
- 全 frame の未 mux `EncodedVideoChunk` をアプリ配列へ溜めること（Mediabunny に渡したらアプリ側では持たない）

Mediabunny は encoder と `StreamTarget` へ backpressure をかけられる。M7 は実装単純化のため `BufferTarget` とする。ドキュメント上の限界: 長尺では最終 MP4 が数百 MB〜になり、タブが落ちることがある。そのときは M8 以降で `StreamTarget` + ファイル直接書き（File System Access API）を検討する。Mediabunny 自身も BufferTarget は目安 100 MB 未満向きと案内している。

### 20. M8 以降

M7 の video track と frame timestamp（`n / 24` 秒）は、後から同じ `Output` へ音声トラックを足す入口になる。M7 で音声用フィールドや AAC UI は作らない。

タイムシートは映像エンコードとは別のデータ出力である。MP4 mux モジュールに混ぜない。

1080p は canvas サイズと capability 確認の定数を足せばよい。保存構造は今も変えない。

### 21. 保存構造

Panel / Cut / Timeline / Motion のフィールドは増やさない。MP4 Blob も Store に入れない。Export snapshot と cache は実行時のみ。

### 22. 完成条件

- Timeline 完成済みの全 Cut を登録順に書き出せる
- Motionなし / PAN / TU / TB / PAN+TU が Rush と同じ見た目になる（解像度は 720p 固定なので画素はプレビューより細かい／粗い差はあり得るが、crop 式は同一）
- 1280×720、24fps、H.264 MP4、映像のみ
- frame 数と MP4 尺が `totalFrames` / 24 秒と一致する
- 1 frame ずつ生成し、生フレームを全保持しない
- 進捗が表示される
- 失敗理由が画面に出る
- MP4 を保存できる
- サーバーへ PDF や映像を送らない
- Rush と MP4 で `frame-renderer` を共用している
- Panel / Cut / Timeline / Motion 保存構造を変更していない
- 未完成 Cut が 1 件でもあれば書き出さない
- 書き出し中の PDF 差し替えを受け付けない
- キャンセルで部分ファイルを保存しない

### 23. 想定リスク

- Safari / Firefox で AVC エンコードが無い
- ハードウェアエンコーダの色空間・クロップで Rush canvas と 1px 差が出る
- `EXPORT_PDF_SCALE_CAP` により強い TU がやや解像不足
- ユニーク Panel が多い／大きいと準備中メモリが膨らむ
- 長尺の最終 Blob でタブが落ちる
- Mediabunny の `frameRate` スナップと整数 µs の実装差
- jsDelivr `+esm` のエントリがバージョンによって変わる（ピン止めと実装時確認）

### 24. M7 では実装しないもの

- 音声 / BGM / SE / WAV / AAC 設定 UI
- 1080p 選択、bitrate UI、fps 変更、23.976 / 30fps
- hardware / software encoder 選択 UI
- WebM / MOV 出力
- タイムシート出力、更新コンテ PDF
- ease / transition / dissolve
- 未完成 Cut のスキップ書き出し
- ffmpeg.wasm フォールバック
- `mp4-muxer`

## M8（実装済み）

1 Panel = 1 placement をやめ、同じ絵を Cut 内で何度でも再使用できるようにする。加えて、所属 Panel 列を共通 hold で総尺まで展開する Repeat を、**placements を生成する編集コマンド**として足す。本節が正である。

Rush の時計、Frame Renderer の crop 式、Motion の `{ cutId, panelId, from, to }`、MP4 のエンコード経路は変えない。Repeat を再生モードにしない。

### 1. 現行との衝突（調査結果）

現行（M4〜M7）の正は次である。

| 箇所 | 現行 |
|---|---|
| Timeline Data | `{ cutId, placements: [{ panelId, startFrame }] }`。`id` なし |
| 一意性 | 同一 Timeline で `panelId` 高々 1、`startFrame` も重複なし（D20 / `validatePlacement`） |
| 完成 | 所属全員にちょうど 1 placement、かつ `0f` あり |
| `validatePlacement` | `others.some(item => item.panelId === panelId)` で二重配置を拒否 |
| `updatePlacement` / `removePlacement` | `panelId` で 1 件を特定 |
| 横バー | `data-panel-id` / `findMarker(panelId)` |
| 数値行 | `dataset.panelId`、`data-timeline-panel`、`timelineDrafts` が panelId キー |
| 選択 | `selectedTimelinePanelId` |
| 未配置 | `!placements.some(p => p.panelId === panelId)` の二値 |
| Panel 削除 Undo | placement を `startFrame` 1 件だけ保持 |
| `deriveRanges` | `startFrame` 順。戻りは `panelId` のみ（placement 識別なし） |
| `resolveFrame` | `startFrame ≤ localFrame` の最後の placement。**panelId 一意は不要** |
| `uniquePanelIds` | Set なので重複 panelId でも画像は 1 回 |
| Motion | `cutId + panelId`。区間は `deriveRanges` |
| `poseForResolvedFrame` | **同じ panelId の最初の range だけ**を取る。複数配置だと 2 回目以降の補間が壊れる |

結論: Rush の「どの絵か」は `startFrame` 順だけで足りる。壊れるのは **編集対象の識別** と **Motion の区間選択** である。したがって placement に `id` を持たせる。

### 2. 新 Timeline Data

```json
{
  "cutId": "cut-001",
  "placements": [
    { "id": "pl-1", "panelId": "panel-a", "startFrame": 0 },
    { "id": "pl-2", "panelId": "panel-b", "startFrame": 4 },
    { "id": "pl-3", "panelId": "panel-a", "startFrame": 12 }
  ]
}
```

- `id`: セッション内で一意。`crypto.randomUUID()`。失敗時のみ `placement-` + 連番
- `panelId`: その Cut の `panelIds` に含まれるもの
- `startFrame`: 整数。`0 ≤ startFrame < durationFrames`
- 扱い順は `startFrame` 昇順のまま
- **同一 `startFrame` は禁止**（12f A と 12f B は不可）
- **同一 `panelId` は許可**（0f A と 12f A は可）
- Cut.panelIds に同じ id を複数入れない。所属は「使える素材」、placement は「いつ出すか」
- Repeat 設定・回数・hold は保存しない

`id` の生成は Store が行う。呼び出し側が未指定なら Store が付ける。

### 3. Cut.panelIds

第一候補どおり、Cut 所属は使用可能な Panel の集合（順序付き配列）とする。並べ替え UI は M8 でも置かない。Repeat の列は当面この順を使う。将来の任意列（A→B→C→B）は Repeat ダイアログの一時 UI に残し、Cut.panelIds へは書かない。

### 4. 表示区間

保存しない。`deriveRanges` が `startFrame` 順で導出する。

- i の終了排他 = i+1 の `startFrame`。最後は `durationFrames`
- 同じ Panel の複数出現はそれぞれ独立
- 戻りに `id`（placement.id）を含める

例: 0f A / 4f B / 8f A → A 0–3f、B 4–7f、A 8f–末尾。

### 5. isComplete（変更する）

所属全員ちょうど 1 placement（D20）は、複数配置および「素材として残す」使い方と衝突する。M8 の完成条件は次とする。

1. placement が 1 件以上
2. いずれかが `startFrame === 0`
3. 各 `startFrame` が整数で範囲内
4. `startFrame` の重複がない
5. 各 `panelId` がその Cut の `panelIds` に含まれる
6. 各 placement に `id` がある

**入れないもの:**

- 所属 Panel がすべて 1 回以上配置されていること
- 所属と placement 件数が一致すること
- 同一 `panelId` 禁止

未使用の所属 Panel はヒント表示（「未使用: B, C」）に留め、Rush / MP4 の拒否理由にしない。Cut に所属 0 件は従来どおり未完成（配置できない）。

Cut 新規作成時の均等配置（M5.4）は、所属全員を 1 回ずつ置く初期値として残す。それは完成を定義しない。短尺で均等できないときは従来どおり未配置のまま作る。

### 6. Store API（案）

`validatePlacement` は `panelId` 重複チェックを外す。除外キーは `exceptPanelId` ではなく `exceptPlacementId`。

- `addPlacement(cutId, { panelId, startFrame }, cut)` → id を付けて追加。同一 startFrame は拒否。同一 panelId は許可
- `updatePlacement(cutId, placementId, startFrame, cut)`
- `removePlacement(cutId, placementId)`（その 1 件だけ）
- `replacePlacements(cutId, placements, cut)`（Repeat 用。検証して全置換）
- `removePanelFromAll(panelId)` は **その panelId の全 placement** を消す（現行と同じフィルタ、件数が増え得る）

`evenPlacements` は各要素に id を付ける。

### 7. Timeline Editor

マーカー・数値行・選択・draft・ドラッグは **placementId** をキーにする。`panelId` だけで `querySelector` しない。

表示は同じサムネイルを何度出してもよい。

選択中 placement の `←/→`（1f）と `Shift+←/→`（5f）、ドラッグ確定は `updatePlacement(..., placementId, ...)`。

配置の削除 UI を足す（選択中の 1 placement）。Cut 所属からは外さない。0f が無くなれば未完成。自動詰めしない（D24 維持）。

### 8. 手動で同じ Panel を再配置

「配置済み / 未配置」二値を正にしない。

所属一覧は素材。各行に整数 `start` と **[追加]** を置き、既に何件あっても新しい placement を足せる。横バーへ所属 Panel を選んでクリック / ドラッグして追加する操作も、未配置専用にしない（選択中の所属 Panel に対する追加）。

数値「更新」は placement 行側（既存の start 変更）とする。

手動で 12f A の直後に 16f A を置いても、入力直後に collapse しない。

### 9. Repeat UI

Cut 詳細の Timeline 付近。最小:

- 列: 現在の `panelIds` 順（表示のみ。M8 では編集しない）
- holdFrames: 整数 frame。補助に秒+コマ（例: `4f = 0+04`）。入力の正は整数
- **[Repeatで置き換え]**
- 既存 placement が 1 件でもあれば確認する（「現在の Timeline を置き換えます。Undo で戻せます。」）

回数入力、Panel ごとの hold、任意列エディタは M8 では置かない。任意列の余地は、実装時に `expandRepeat(sequence, holdFrames, durationFrames)` の第一引数を `panelIds` 以外にも渡せる関数形にしておくこと。

### 10. Repeat 展開

編集コマンド。生成物だけが正本。

```
t = 0
i = 0
sequence = cut.panelIds（空なら失敗）
holdFrames は 1 以上の整数（失敗なら実行しない）
while t < durationFrames:
  placements += { id: 新規, panelId: sequence[i % length], startFrame: t }
  t += holdFrames
  i += 1
連続同一 panelId を collapse（後者を削除）
startFrame 検証のうえ Timeline を全置換
```

- 総尺を超える `startFrame` は作らない（`t < durationFrames`）
- 割り切れなくてもよい。82f・A/B/C・4f なら最後は 80f C で C は 80–81f
- holdFrames ≥ durationFrames なら 0f の 1 件だけ（その 1 Panel が全尺）
- Repeat 回数は入力も保存もしない

### 11. collapse

**Repeat 生成直後だけ**自動。`startFrame` 順で直前と `panelId` が同じなら後者を捨てる。

- A A B → A B（A が連続区間になる）
- A B A は畳まない
- 列が A のみなら全 collapse で 0f A の 1 件

手動追加・ドラッグ・矢印では畳まない。Rush では同じ画像が続く。M9 タイムシートで連続同一 Panel を正規化できるよう、導出関数 `collapseConsecutive(placements)` を Timeline 保存の外に置ける形にする。M8 では Repeat 生成時だけ呼ぶ。

### 12. Repeat 再実行

**確認のうえ全置換（C + A）**とする。

- 既存へ追記しない（周期がずれ、startFrame 衝突が起きやすい）
- 空 Timeline なら確認なしで置換してよい
- 正本は Repeat 設定ではなく置換後 placements
- 誤操作は Undo 1 回で Repeat 前の placements 全体へ戻す

### 13. Undo / Redo

対象:

- placement 追加（1 件）
- placement 削除（1 件）
- placement の `startFrame` 変更（数値・ドラッグ・矢印）
- Repeat による全置換（1 Action）

Repeat の Undo/Redo は前後の placements 配列全体（各 `id` / `panelId` / `startFrame`）を持つ。生成された数十件を履歴に積まない。

Panel 削除 Undo は、消した **全 placement** を元の `id` と `startFrame` で戻す。現行の `startFrame` 1 件スナップでは不足する。

Cut から Panel を外す操作が Undo 対象外のままなら（M5.3 は Cut 所属変更を対象外）、外すこと自体は従来どおり即時。M8 で所属変更を履歴に入れる必要はない。外した結果の placement 全削除は、その操作の一部として実行する。

### 14. Panel 削除 / Cut から外す

Panel A 削除: 全 Cut の `panelIds` から A、全 Timeline の A の **全** placement、A の Motion。残った配置を 0f へ詰めない。0f が A だけなら未完成。

Cut から A を外す: その Cut の A の全 placement と、その Cut の A の Motion。他 Cut は触らない。詰めない。

### 15. Motion

保存は `{ cutId, motions: [{ panelId, from, to, preFixFrames, postFixFrames }] }`。未指定の FIX は 0。placement 単位にはしない。

同じ panelId の全出現で同じ from/to と FIX を使う。各出現の **その表示区間** で `sampleMotionOnRange` する（preFIX は from 静止、本体は線形補間、postFIX は to 静止）。

そのため `poseForResolvedFrame` は「その panelId の最初の range」を使ってはいけない。`resolveFrame` が返す `placementId`、または `localFrame` を含む range で選ぶ。表示が 1 フレームの出現は現行どおり Motion 非適用。

Timeline からその panelId の placement が 0 件になっても Motion は残してよい（現行）。再配置後に同じ画角を使える。

### 16. Rush / MP4

Rush Player に Repeat を足さない。時計は変えない。

`buildSnapshot` は最終 placements をコピーする（`id` を含めてよい）。

`resolveFrame` の選び方（startFrame 昇順で `≤ localFrame` の最後）は複数 A でも正しい。戻りに `placementId` を足す。Play 仕様（dirty、終端、rAF）は変えない。

MP4 は Repeat を知らない。既存 `resolveFrame` → pose → `renderFrame`。exporter に MP4 専用分岐を足さない。`uniquePanelIds` は重複を 1 枚にまとめるので Export 画像も足りる。

### 17. 秒+コマ

M5.4 のまま。正規値は整数 frame。holdFrames の補助だけ秒+コマを出してよい。秒+コマ入力は hold にも start にも必須としない。

### 18. M9 への受け渡し

正本は最終 placements。M9 は `deriveRanges` →（任意で）`collapseConsecutive` → タイムシート行。M8 はタイムシート UI もファイルも作らない。

### 19. migration

永続保存も JSON ロードもない。リロードで消える。ファイル互換の migration は **不要**。

実装切替後、メモリ上の旧 `{ panelId, startFrame }` が残ることはない（ページを開き直すか、Store が id なしを読んだら生成する防御を入れてよい）。テストや `evenPlacements` の組み立て漏れだけが対象。

### 20. 完成条件

- 同一 Panel を複数 startFrame に置ける
- 同一 startFrame の二重配置は拒否
- 表示区間が出現ごとに独立
- Repeat が総尺まで placements を生成し、Store へ置換する
- Repeat 後にドラッグ / 1f / 5f / 追加 / 削除ができる
- Repeat 再実行は確認のうえ置換。Undo 1 回で元 Timeline
- 手動の連続同一 Panel は残る
- 所属未使用 Panel があっても、0f と妥当な placements があれば Rush / MP4 できる
- Panel 削除でその Panel の全 placement が消える。自動詰めしない
- 同じ panelId の各区間で同じ Motion が区間ローカルに補間される
- Rush 時計と MP4 経路に Repeat を足していない
- Cut / Panel / Motion の保存フィールドを増やしていない
- Repeat 設定を永続化していない

### 21. M8 では実装しないもの

- タイムシート、更新コンテ PDF
- 音声、transition、dissolve
- Repeat 回数入力、Panel ごと hold
- placement 単位 Motion
- Repeat 設定を再生時の正本にすること
- 任意列（A→B→C→B）の本編集 UI
- 連続同一 Panel の手動入力直後の自動削除
- 0f 欠落時の自動詰め

### 22. 想定リスク

- Timeline 行が Repeat で多くなり、UI が長い
- hold=1 の Repeat で 1 フレーム区間が量産され、それらの Motion が静止扱いになる
- pose の range 選択を直し忘れると 2 回目の A で Motion がずれる
- マーカー重なり（近い startFrame）の操作しづらさ
- 確認なし Repeat は破壊的（確認と Undo で緩和）

## M9（実装済み）

選択中 Cut の最終 Timeline と Motion から、印刷用の **JIS B4 縦（257mm × 364mm）** タイムシート PDF を出す。タイムシートは正本にしない。一方向:

既存データ → Timesheet View Model → プレビュー / PDF

Panel / Cut / Timeline / Motion / Repeat / Rush / MP4 の Store と再生ロジックは変えない。

### 1. 用紙と frame

- 用紙: JIS B4 縦（portrait）。PDF の MediaBox は 257mm × 364mm（pt 換算 `mm * 72 / 25.4`）。`page width < page height`
- 1 秒 = `FRAMES_PER_SECOND`（24）。M9 側へ 24 を再定義しない
- 1 シート = `TIMESHEET_SECONDS_PER_SHEET`（6）× `FRAMES_PER_SECOND` = 144 frame
- 内部 cutFrame は 0 始まり。紙面の行は 1〜144。`0f → 行1`、`23f → 行24`、`144f → シート2の行1`
- 左ブロック 1〜72、右ブロック 73〜144。24 frame ごとに太線
- `sheetCount = ceil(durationFrames / 144)`。各ページのグリッド表記は常に 1〜144

### 2. ヘッダ

自動: 話数、タイトル、カット（`cut.cutNumber`）、秒数（`formatDuration(durationFrames)`）、シート `n / N`  
空白: 原画、撮影  
ロゴなし

話数 / タイトルは Cut に保存しない。PDF セッション単位の UI 状態。新しい PDF の読み込み成功時に初期化する。

### 3. ACTION / CELL

ACTION A〜F は枠だけ。中身は空白。Panel 番号は書かない。

CELL は A 列だけ使う。番号は `Cut.panelIds` 順の 1, 2, 3…。同じ panelId は何度出ても同じ番号。UUID は書かない。

丸数字は Unicode に頼らず、円と数字を描画する（21 以上も同じ。桁が増えたら文字を小さくする）。

同一 Panel の継続区間は開始行に番号、以降は縦線。シート先頭では、そのページで継続中の Panel を再番号する（縦線だけから始めない）。

### 4. 出力時 collapse

M8 の連続同一 panelId placement は、**View Model 生成時だけ** `collapseConsecutive` する。Timeline Store は触らない。A→A→B は A 継続→B。A→B→A は 3 切替。

### 5. CAMERA

`motionLabel(from, to)` を再利用。PAN / TU / TB / PAN+TU / PAN+TB。`静止` と 1 フレーム区間（`canSampleMotion` 不可）は描かない。Motion Data は消さない。

Motion は `cutId + panelId`。同じ Panel の各 range ごとに、preFIX / 本体 / postFIX を描く。

本体:

- 真の `motionStart` に Motion名 + A
- 途中は一本の縦線
- 真の `motionLast` にだけ矢印head + B
- 矢印head は Motion range につき 1 つ

シート / 左右ブロック境界で分割されても、途中に矢印headを置かない。継続ページは線のみ。B と head は真の終了があるページだけ。

FIX:

- 区間の先頭（と、シート先頭で継続しているとき）に `FIX`
- 縦線。矢印headなし
- ページ単体で FIX 中だと分かるようにする

Rush / MP4 と同じ `sampleMotionOnRange` の区間（`motionStart`〜`motionLast`）を CAMERA の本体に使う。

### 6. 生成

- `js/timesheet-model.js`: 純粋関数。DOM / PDF を知らない
- `js/timesheet-renderer.js`: 1 シートを Canvas に描く（クリーム紙、赤茶罫線）。B4 縦へ再フィット。回転しない
- `js/timesheet-pdf.js`: pdf-lib `1.17.1`。各シートを 8 px/mm で描き PNG として B4 ページ全面へ。サーバーへ送らない

ファイル名: `<PDF名>-cut<cutNumber>-timesheet.pdf`。数字の CUT 番号は 3 桁に揃える。危険文字は除去。

Timeline 未完成、Cut 未選択では出力しない。

### 7. Motion の preFIX / postFIX（M9）

Motion Data へ `preFixFrames` / `postFixFrames`（0 以上の整数、初期 0）を足す。秒は保存しない。無いレコードは 0。

`sampleMotionOnRange` が Rush と MP4 の唯一の補間入口である。`poseForResolvedFrame` がそれを呼ぶ。

本体が 2 frame 未満になる FIX は保存拒否。既存 Motion は消さない。同一 Panel の各 placement range に同じ FIX を適用する。

### 8. M9 では実装しない

ACTION 自動記入、CELL B〜F、原画/撮影の自動、タイムシート上の編集、Excel/CSV/import、音声、任意 fps

## M10（実装済み）

PDF 以外からも Panel を足す。conte-rush をお絵描きソフトにはしない。「ラッシュに 1 枚足したい」「中間のラフを描きたい」用途の簡易作成である。

M10.0（Provider / source 拡張）、M10.1（手描き・Upload UI）、M10.2（Onion Skin）、M10.3（Timeline / Onion の見え方）、M10.4（Timeline ＋挿入）は実装済み。

### 1. 現行経路（実装済み・調査結果）

M9 までの画像はすべて PDF crop である。

| 用途 | 入口 | 倍率 |
|---|---|---|
| Thumbnail | `app.requestThumbnail` → `cropPanelImage(pdf, panel, PREVIEW_SCALE=1.5)` → Blob URL → `ThumbnailCache` | 1.5 |
| Rush | `prepareRushImages` → `cropPanelImage(..., RUSH_SCALE=2)` → img → `RushImageCache` | 2 |
| MP4 | `export-image-cache.prepare` → `computeExportPdfScale`（Motion 最大 scale × 1280）→ `cropPanelImage` | 最大 8 |
| Motion Editor | ThumbnailCache の URL。無ければ RushImageCache | キャッシュ依存 |
| タイムシート | Panel 画像は使わない。`panelIds` と placements と Motion だけ | — |

`panel-store.add` は常に `source: "manual"` と PDF 矩形を書く。`clonePanel` / 削除 Undo もその 6 フィールドだけ。`listAll` は `pageNumber` でソートする。overlay は `listByPage`。

Timeline / Repeat / Motion / タイムシート番号は `panelId` だけを見る。`source` は見ない。

### 2. PDF 前提のまま drawing / upload を足すと壊れる箇所

- `cropPanelImage` / `pdfDocument.getPage(panel.pageNumber)` — pageNumber が無いと throw
- `requestThumbnail` — `session.document` 必須。PDF crop 固定
- `prepareRushImages` — 同じく PDF crop。失敗すると再生拒否
- `computeExportPdfScale` / `ExportImageCache.prepare` — getPage + 相対座標
- `freezeExportPanels` + `clonePanelData` — 矩形だけコピー
- `listAll` の `pageNumber` 比較 — `undefined` で NaN ソート
- 一覧 / Cut 所属の `ページ n` / `p.${pageNumber}`
- overlay `listByPage` — 出ない（これは正しい。PDF 枠ではない）
- 削除 Undo の `clonePanelData` — Blob が戻らない
- `clearSessionData` — Media を別 Store にした場合、そこも消す必要がある

Timeline / Repeat / Motion の補間式 / タイムシート CELL 番号は、id さえあれば壊れない。

### 3. Panel Data

discriminated union。`"manual"` は改名しない。

```
PdfPanel:     { id, source: "manual", pageNumber, x, y, width, height }
DrawingPanel: { id, source: "drawing" }
UploadPanel:  { id, source: "upload" }
```

比較した別案:

| 案 | 採用しない理由 |
|---|---|
| `"manual"` を `"pdf"` に改名 | 既存 add/clone/履歴の書き換えだけ増える。永続 JSON は無いが互換の意味が薄い |
| drawing にも pageNumber=1 等のダミー | 偽の PDF 位置になり、overlay / crop / 一覧が誤動作する |
| `imageSource` を別フィールド | source と二重管理 |

`"auto"` は予約のまま。M10 では作らない。

画像バイトは Panel に載せない。`PanelMediaStore`（`panelId` → `{ kind, blob, mimeType, width, height }`）。

作成は開いている PDF セッション中だけ。手描き専用ワークスペースは置かない。

### 4. 共通 Panel Image Provider（M10.0・実装済み）

`js/panel-image-provider.js` の `createPanelImageProvider({ getPdfDocument, mediaStore }).getRenderable(panel, options)`

```
options: {
  purpose: "thumbnail" | "rush" | "export" | "motion" | "onion",
  scale?,
  pdfDocument?,
}
→ { image, canvas?, width, height }
```

- `"manual"` / `"auto"`: `cropPanelImage`。`scale` を渡す。export の pdfScale は `computeExportPdfScale` が先に決めて Provider へ渡す
- `"drawing"` / `"upload"`: MediaStore の Blob を decode。scale では再 raster しない
- 責務外: Timeline、Motion 補間、Rush 時計、MP4 encode、Cut

ThumbnailCache / RushImageCache / ExportImageCache は寿命の違うキャッシュのまま。作る処理だけ Provider を呼ぶ。

M7 を壊さない: PDF だけ requested scale を変える。drawing/upload を「全部同じ固定解像度」に寄せて PDF の再 crop を消さない。

一覧 `listAll` は PDF を pageNumber 昇順（従来）。pageNumber が無い Panel は NaN にせず末尾へ。`listInRegistrationOrder` は登録順。Cut.panelIds は作成時の一覧順（従来どおり `listAll`）。

### 5. 手描き Panel（M10.1・実装済み）

「手描きPanel」から overlay を開く。

- 内部 1280×720、表示は CSS 縮小。白背景、黒ペン、消しゴム、サイズ 3 段階
- Pointer Events（マウス / ペンタブ / タッチ / Apple Pencil）。筆圧なし
- 編集中 Undo / Redo / 全消去は editor 内部。`history.js` には一筆を積まない
- 確定で Panel 追加 + MediaStore に PNG。キャンセルは捨てる
- 再編集: 同じ id。所属 / placements / Motion / タイムシート番号は変えない。サムネ更新、Rush cache 破棄、dirty。確定は history 1 Action（旧Blob / 新Blob）
- 色、レイヤー、塗り、選択、図形、テキストは置かない

正本: 確定 PNG Blob。編集中だけ stroke。再編集は flatten 画像の上に描く。

### 6. Upload Panel（M10.1・実装済み）

- 受け付ける: PNG / JPEG / WebP。それ以外は拒否して理由を出す
- 16:9 でなくても拒否しない。Motion なし Rush は現行 contain。Motion ありは現行 crop
- decode は `createImageBitmap(blob, { imageOrientation: "from-image" })` を第一とする。無い環境は実装時にフォールバックを決める。EXIF 回転を無視して横倒しにしない
- サーバーへ送らない。ローカルファイルをブラウザ内で読むだけ
- 差し替え: 既存 upload の Blob だけ交換。id 維持。M10.1 に含める

### 7. Onion Skin（M10.2・実装済み）

手描き編集中のみ。

- 前 / 次を独立 ON/OFF。opacity 初期約 0.35。stroke より背面。確定 PNG に焼かない
- 前後 = 対象 `placementId` の Timeline 隣接 range。`deriveRanges` の startFrame 順
- Repeat で同じ panelId が複数あっても、隣接は placement 単位
- 透かす画像は Provider の元 Panel。Motion 適用後の画は使わない
- `placementId` が無い新規作成では **無効**。Cut.panelIds フォールバックはしない

### 7.1 Timeline / Onion の見え方（M10.3・実装済み）

保存構造は変えない。新しい Store も作らない。

追加候補（所属 Panel）:

- 既存 ThumbnailCache のサムネイル
- `Cut.panelIds` 内の順番を基準にした 1-based 番号（タイムシートの `panelNumberMap` と同じ。初出位置）
- 種別: PDF は「ページ n」、drawing は「手描き」、upload は「画像」
- startFrame 入力、秒+コマ補助、［追加］
- UUID はユーザー向けに出さない

配置済み:

- サムネイル、同じ Panel 番号、start の秒+コマと frame、導出区間
- ［削除］は既存の placement 削除。Panel / `Cut.panelIds` / MediaStore / Motion は消さない
- drawing だけ ［絵を編集］。渡す context は `{ cutId, placementId, panelId }`

選択:

- 横 Timeline マーカーと配置済み行は `placementId` で対応する
- 同じ `panelId` の別 placement をまとめて選ばない

Onion Skin 表示:

- 「前後の絵を透かして表示（Onion Skin）」と、Timeline 前後をガイドにする説明
- 各側: 小さいサムネ、前の絵 / 次の絵、Panel 番号、表示 ON/OFF、opacity と %
- 先頭は「前の絵はありません」、末尾は「次の絵はありません」
- Panel 一覧の［編集］（placement 無し）は前後を推測せず、「前後の絵を表示するには、Timelineの［絵を編集］から開いてください」
- 前後の解決は M10.2 のまま（`placementId` → `deriveRanges` / startFrame 順）
- 画像取得は ThumbnailCache（UI サムネ）と Provider `purpose: "onion"`（reference canvas）。焼き込みしない

### 7.2 Timeline ＋挿入（M10.4・実装済み）

保存構造は変えない。InsertionContext は UI 状態のみ。

横 Timeline の空白:

- 既存 `xToFrame` で候補 startFrame（0 … durationFrames-1）
- 既存のカーソル追従プレビュー（黄線＋「＋」）をクリック可能にする。別描画の常設＋は置かない
- そのプレビューをクリックしたときだけメニューを開き、その瞬間の frame を固定
- 追加位置を `formatFrameTimeLabel` で表示（例: `1+16（40f）`）
- ［既存Panelを追加］［手描きPanelを追加］
- メニューは外クリック / Esc / 操作完了で閉じる
- marker 上は選択 / drag。空白は＋。既存 drag は壊さない

既存 Panel:

- 所属素材を M10.3 と同じサムネ / 番号 / 種別で選ぶ
- 候補 frame へ新しい placement。同じ Panel の再配置可（M8）
- 既存 `addPlacement` + history 1 Action。素材は消さない

手描き:

- まだ Store へ確定しない挿入 context `{ mode: "insert", cutId, startFrame }`
- 前後は `neighborsAroundFrame(cut, timeline, startFrame)`。既存編集の `onionNeighbors(placementId)` とは別
- 前/次があれば初期 ON / 35%。先頭は次だけ、末尾は前だけ
- Editor に「Timeline 1+16（40f）へ手描きPanelを追加」と前後サムネ
- キャンセルで何も残さない
- 確定: drawing Panel → MediaStore → Cut.panelIds 末尾 → placement。history は「手描きPanelをTimelineへ追加」1 Action
- Onion は reference のみ。保存 PNG / Thumbnail / Rush / MP4 に焼かない

同じ startFrame の既存 placement があるときは、UI に＋は出してよいが、確定は `validatePlacement` で拒否する。

詳細側の追加 UI は残す。どちらも同じ placement Store API。

### 8. 削除・Undo・PDF 再選択

削除は現行どおり: Cut 所属、全 placement、Motion、サムネ / Rush cache、dirty。加えて MediaStore。

Undo は同じ id、Store 位置、所属位置、placement id/startFrame、Motion、**Blob** を戻す。ImageBitmap は履歴に持たず、復元後に decode する。1280×720 PNG は 1 枚数百 KB〜1MB 程度を想定。履歴に数十枚乗ってもセッション用途では許容する。

PDF 再選択成功: drawing / upload も含め `clearSessionData`。失敗維持: すべて残す。

### 9. タイムシート

`Cut.panelIds` 順の番号のまま。drawing / upload も ①②③…。source は印字しない。画像は使わない。renderer の変更は不要な想定。

### 10. UI

既存の「画像取得」「ドラッグ」は残す。隣へ「手描きPanel」「画像Upload」。PDF 未読み込みでは disabled。

手描きは PDF ステージを覆う大きい overlay（D100）。右カラムには置かない。

### 11. 完成条件

- M10.0: Provider 経由で現行 PDF Panel の Thumbnail / Rush / Motion / MP4 が M9 と同じ
- M10.1: 手描きと Upload を Cut に入れ、Repeat / Motion / Rush / MP4 / タイムシート番号が通常 Panel と同じ。再編集と Upload 差し替え。PDF 再選択で全消去
- M10.2: placement 付き手描き編集で前後 Onion。未配置では出ない。焼き込みなし
- M10.3: 追加候補と配置済みを絵と番号で見分け、placement だけ削除でき、Onion の前後が分かること。保存構造は変えない
- M10.4: 横 Timeline の＋から既存 / 手描きを候補 frame へ挿入できる。手描きは左右 Onion が最初から見える。保存構造は変えない

### 12. M10 では実装しない

AI 検出、OCR、自動中割、レイヤー作画、色塗り、筆圧、音声、S 欄入力、プロジェクト保存、クラウド、サーバー Upload、手描き専用モード（PDF なし）

## M11.0（実装済み）

一般公開に向けて、Login / User identity / Access entitlement / 本体へのアクセス制御だけを安全に分離する。本節は M11.0 実装時の正である。当時は Stripe 決済を実装しない。現行の課金経路は M11.4。

公開後の扱い:

- 社内ユーザー → 無料（`internal`）
- 一般ユーザー → 月額約 100 円（`paid`。M11.2 以降）
- どちらでもない → 利用不可（`none`）

GitHub repository は public のままでよい。GitHub Pages での利用を続ける。private 化は公開後の候補であり、正式公開の blocker ではない。

### 1. 境界

```
App bootstrap
  → Auth initialization（js/auth-client.js）
  → session check
  → access check（js/access-gate.js）
  → allowed
  → 既存 conte-rush initialize（js/app.js）
```

`app.js` に Supabase のクエリや鍵扱いを大量に書かない。制作 Store（Panel / Cut / Timeline / Motion / Media）は利用権の正にしない。

社内版と公開版でコードベースを分けない。`internal` と `paid` は同じアプリ機能を使う。M11 では「internal だけ別機能」「public だけ別機能」を作らない。

### 2. 利用権モデル

ログイン後:

```
internal_users.enabled === true ?
  YES → effectiveAccess = "internal" → 利用可能
  NO
    subscription が paid 条件 ?
      YES → effectiveAccess = "paid" → 利用可能
      NO  → effectiveAccess = "none" → 利用不可 / 契約案内
```

M11.0 では Stripe 契約から `paid` を作らない。後から webhook が `subscriptions` を更新できる表にする。テストは `manual_fixture` 行で行う。

比較した案:

| 案 | 内容 | 採用 |
|---|---|---|
| A | ユーザー行に `access_type: "internal" \| "paid" \| "none"` だけを正本にする | しない |
| B | `internal_users` と `subscriptions` を分け、`effectiveAccess(userId)` で導出する | **する** |

案 A を採らない理由: Stripe 状態と社内無料権限が 1 カラムに混ざる。webhook と管理者の enable/disable が上書きし合う。

JWT `app_metadata` も正本にしない。将来のキャッシュにはできるが、M11.3 の正は表の行とする。

### 3. Auth 方式

候補:

| 方式 | UX | 実装 | GitHub Pages |
|---|---|---|---|
| A. Email + Password | まれな利用では忘れる。リセットが先に要る | 中 | 問題なし |
| B. Magic Link | パスワード不要。メール内リンクが別ブラウザ / 企業メールの書き換えで失敗しやすい | redirect URL の処理が要る | 設定が増える |
| C. Email OTP | パスワード不要。同じ画面でコードを入れる | 少 | redirect に依存しない |

M11.0 の第一候補は **C. Email OTP**。目標の流れは次のとおり。

- メールアドレス入力 → コード送信 → 同じ画面で検証
- 初回はユーザー作成してよい（`shouldCreateUser: true`）
- 作った直後の `effectiveAccess` は `none`（internal 行も paid 行も無い）
- Google OAuth は入れない

暫定実装（D119）: 新規 Supabase Free + default SMTP では email template を編集できず、`{{ .Token }}` の OTP メールへ変えられない。そのため Auth UI だけを **Magic Link** にする。

- メールアドレス入力 →「ログインリンクを送る」→ `signInWithOtp()`（`emailRedirectTo` は origin + ディレクトリルート + 末尾 `/`。D125）
- コード入力 / `verifyOtp` UI は出さない。`verifyEmailOtp` は残し、custom SMTP 後に数字 OTP へ戻せる
- Magic Link は PKCE（`flowType: "pkce"`）。`?code=` の交換が終わるまでログイン画面に落とさない。`detectSessionInUrl: true`。不足時は `exchangeCodeForSession`
- リンクは送った同じブラウザで開く。verifier が無いときは認証エラーとしてログイン画面へ戻す（`network_error` ではない）
- access check / DB / RLS は変えない

### 4. Supabase に持つもの / 持たないもの

持つ:

- Supabase Auth user
- `internal_users`
- `subscriptions`

持たない:

- `profiles`（不要。メールは session から読む）
- PDF / Panel Data / Cut Data / Timeline / Motion
- Drawing PNG / Upload 画像 / Rush / MP4 / Timesheet PDF

制作データは現状どおりブラウザセッション内である。

### 5. テーブル

`internal_users`:

| 列 | 型の目安 |
|---|---|
| `user_id` | `uuid` PK。`auth.users(id)` ON DELETE CASCADE |
| `enabled` | `boolean` NOT NULL DEFAULT true |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() |
| `updated_at` | `timestamptz` NOT NULL DEFAULT now() |

email 列は持たない。権限の正は `user_id` + `enabled`。M11.1 の運用は、本人が先に Magic Link でログインし、管理者が SQL Editor で `auth.users.email` から `id` を引いて `internal_users` へ入れる。UID の手コピーはしない。未サインアップ向け invite 表は作らない。管理画面は作らない。

`subscriptions`:

| 列 | 型の目安 |
|---|---|
| `user_id` | `uuid` PK。`auth.users(id)` ON DELETE CASCADE |
| `provider` | `text` NOT NULL。`"stripe"` \| `"manual_fixture"` |
| `status` | `text` NOT NULL。アプリ enum |
| `current_period_end` | `timestamptz`（nullable） |
| `customer_id` | `text`（nullable。Stripe `cus_...`） |
| `subscription_id` | `text`（nullable。Stripe `sub_...`） |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() |
| `updated_at` | `timestamptz` NOT NULL DEFAULT now() |

`status` は Stripe 生値を正本にしない。アプリ用:

`active` / `trialing` / `past_due` / `canceled` / `unpaid` / `incomplete` / `paused`

生値保存案は、ゲートが Stripe 語彙に縛られるため採らない。M11.3 の webhook が写像する。

M11.0 の paid 条件:

- `status` が `active` または `trialing`
- `current_period_end` は補助情報であり、クライアント時計だけで利用不可にしない

`past_due` は paid にしない。猶予期間は設けない（M11.4 で確定。M11.8 でも猶予しない）。Portal で支払方法を更新する。

fixture: Supabase SQL editor（service role）で `provider='manual_fixture'` かつ `status='active'` の行を入れる。production でクライアントから `paid=true` を書けないこと。

### 6. effectiveAccess

保存しない。読むたびに導出する。

```
effectiveAccess(userId):
  internal_users に userId があり enabled === true → "internal"
  else subscriptions が paid 条件 → "paid"
  else → "none"
```

両方満たすときは `"internal"`。

クライアントに「利用権 Store」を正として置かない。`js/access-store.js` は M11.0 では作らない。確認結果は Gate のメモリ上の状態だけとし、書き込み API を持たない。

### 7. RLS

原則: ブラウザは自分の利用権を読むだけ。変更は将来の管理処理または Stripe webhook（service role）。

```
internal_users / subscriptions:
  ENABLE ROW LEVEL SECURITY

SELECT（authenticated）:
  user_id = auth.uid()

INSERT / UPDATE / DELETE:
  anon にも authenticated にも policy を付けない
```

`anon` は両表を読めない。テーブルの GRANT も SELECT 以外を authenticated / anon から外す。service role は RLS を迂回できる（webhook / SQL fixture 用）。

クライアントの JS で `internal = true` と書き換えても、テーブルは変わらない。静的アプリではゲート DOM を外す改変は防ぎ切れない。M11.0 の守る線は「正のデータをクライアントが書けない」「未確認ではアプリを初期化しない」である。制作ファイルは元々サーバーに無い。

### 8. anon key / service role

| 値 | ブラウザ | GitHub Pages / 公開 repo |
|---|---|---|
| Supabase URL | 置いてよい | 置いてよい |
| anon / public key | 置いてよい（RLS 前提の公開鍵） | 置いてよい |
| service role key | **禁止** | **禁止** |
| Stripe secret / webhook secret | **禁止**（M11.0 では導入しない） | **禁止** |

`index.html` / `app.js` / `runtime-config.js` / GitHub Pages に service role を置かない。M11.0 で秘密鍵ファイルは作らない。

### 9. Auth Gate の状態機械

| 状態 | UI | アプリ初期化 |
|---|---|---|
| `unconfigured` | Supabase設定が未完了です | しない |
| `loading` | 確認中 | しない |
| `unauthenticated` | ログインフォーム | しない |
| `checking_access` | 利用権を確認中 | しない |
| `allowed` | 通常の conte-rush + 小さい Account | **する** |
| `denied` | 利用権がありません。将来の月 100 円ボタン位置 | しない |
| `network_error` | 利用権を確認できませんでした。ネットワークを確認してください | しない |

fail-closed: `allowed` 以外では本体を操作できない。

fail-closed の例外にしないこと: `network_error` を `denied`（未契約）と出さない。Checkout へ飛ばす導線も M11.0 には無い。

再試行ボタンは `network_error` に置いてよい。

### 10. 既存アプリとの境界

現行 `js/app.js` はモジュール読み込み時に `showIdle()` する。M11.0 実装では:

- エントリを Auth Gate にする（`index.html` が `access-gate.js` を読む、または gate が `app.js` の `initializeConteRush()` を呼ぶ）
- `allowed` になるまで PDF 選択 / Panel / Timeline / Rush を隠すか disabled
- 初期化前に操作イベントで制作データを作らない

ログアウト後は制作データを捨てて Gate へ戻る。再 `allowed` なら改めて initialize してよい。

### 11. UI

大規模な Landing Page は作らない。既存 UI へ最小限足す。

未ログイン（`unauthenticated`）:

- 見出し `conte-rush`
- メール入力と「ログインリンクを送る」（暫定 Magic Link。D119）
- コード入力欄は出さない。custom SMTP 後に数字 OTP UI へ戻せる
- 本体ワークスペースは出さない

`denied`（`none`）:

- 「利用権がありません」
- 社内からコードを受け取った方は招待コードで登録（M11.6）。管理者の SQL 付与も残る
- M11.4: 月額100円（税込）・自動更新・解約可。［月額100円で利用する］は Checkout Session。past_due 等は［契約を管理］。Payment Link 未設定メッセージは出さない
- `checkout=success` は案内だけ。`paid` にしない

`allowed` かつ `internal`:

- 通常の conte-rush
- 画面全体に「社内版」を常時出す必要はない
- Account: メールと「利用権: 社内」とログアウト

`allowed` かつ `paid`:

- 通常の conte-rush
- Account: メールと「利用権: 契約中」とログアウト
- M11.0 では fixture で確認できればよい

Account はヘッダーの小さい表示で足りる。

### 12. ログアウト

Account からログアウトできる。

順序:

1. 既存 `clearSessionData()` を呼ぶ（Panel / MediaStore / Cut / Timeline / Motion / 履歴 / Rush / Timesheet UI / overlay を破棄する）
2. 開いている PDF document を破棄し、PdfSession を空にする
3. idle 相当の UI に戻す
4. Supabase `signOut`
5. Auth Gate を `unauthenticated` にする

制作データを残したまま Auth だけ切らない。別ユーザーに前の PDF / Panel が見える事故を防ぐ。

調査結果: `js/app.js` の `clearSessionData()` は制作 Store を一括クリアする。PDF document 破棄は `replaceSession` 側にあるため、ログアウト実装は `clearSessionData` + PDF 破棄 + `showIdle` 相当を組み合わせる。

### 13. session 復元と access 再確認

Supabase Auth session はリロード後も残り得る。毎回ログイン画面へ強制しない。

起動時:

1. 既存 session を読む
2. あれば access を再確認する
3. `allowed` ならアプリへ進む

access をログイン成功時に 1 回だけ永久キャッシュしない。localStorage に `access=paid` を正として書かない。

M11.0 の再確認:

- 起動時
- Auth session change（ログイン、ログアウト、token 更新）

M11.3 / M11.4 で足せる余地: ウィンドウ再フォーカス、一定時間ごと。M11.0 では必須にしない。

### 14. 通信と障害

conte-rush 本体はブラウザ処理中心でも、利用権確認にはネットが要る。M11.0 は完全 offline 利用を保証しない。

| 事象 | 状態 | 出してはいけない表示 |
|---|---|---|
| Supabase に届かない / タイムアウト | `network_error` | 利用権がありません |
| 行が無く `none` | `denied` | ネットワークエラーと同一文 |
| Auth 一時障害 | `network_error` | subscription none として契約画面へ進める |

### 15. runtime config と localhost

新規 `js/runtime-config.js`（または同等）:

- `supabaseUrl`
- `supabaseAnonKey`

これは秘密情報ではない。service role をここに書かない。

ビルド工程は増やさない。値は静的 JS に書いてよい。

Supabase Auth の設定項目（実装時に dashboard へ入れる）:

- Site URL: 本番 GitHub Pages URL
- Additional Redirect URLs: Pages URL と `http://localhost:8080/`（README の例。実際に使う origin を列挙）
- `127.0.0.1` を使うならそれも追加する
- Magic Link 暫定中は Redirect URLs が必須。`emailRedirectTo` は origin + ディレクトリルート + 末尾 `/`（D125）。`http://localhost:8080/` と `https://mook-hary.github.io/conte-rush/` を列挙する

数字 OTP に戻したあとも Site URL と許可 origin は Pages と localhost の両方を扱う。

supabase-js は PDF.js / Mediabunny と同様、**ピン止めした CDN ESM** を第一候補とする。`@latest` は使わない。版は実装時に DECISIONS へ追記してよい。

### 16. GitHub Pages

M11.0 では GitHub Pages を維持する。repo が public でも、runtime config に秘密鍵が無ければ「漏洩して困る資格情報」は増えない。anon key は公開前提である。

repository private 化は公開後の候補であり、正式公開の blocker ではない。M11.0 で Cloudflare 移行を必須にしない。正式有料公開も GitHub Pages のままでよい（M11.5 は公開後の移行候補）。

M11.0 のゲートは Pages + Supabase Auth だけで成立させる。Stripe webhook のサーバー処理は M11.3 で Supabase Edge Function とした（Cloudflare Functions は使わない）。

### 17. Supabase Free の pause

Free プロジェクトは非活動で pause され得る。これは M11 の運用リスクである。

社内ユーザーや自分自身が通常利用して Auth / DB アクセスが続けば、活動として寄与し得る。ただし「時々使えば絶対 pause しない」とはしない。

正式有料公開で Auth の安定が必要になった段階で、Supabase Pro への移行を検討する。公開ブロッカーではない。時期は [ROADMAP.md](ROADMAP.md) の公開後項目。

### 18. モジュール

実装したファイル:

| ファイル | 責務 |
|---|---|
| `js/runtime-config.js` | 公開してよい URL / anon key だけ |
| `js/auth-client.js` | Supabase client（`flowType: "pkce"`）、`signInWithOtp` / `verifyEmailOtp`、PKCE callback、session、signOut。RLS 表の書き込みを持たない。UI は暫定 Magic Link |
| `js/auth-redirect.js` | `emailRedirectTo` の末尾 `/` 正規化、callback query の読取 / 除去。supabase に依存しない |
| `js/access-gate.js` | 状態機械、UI 切替、access 再読込、allowed 時だけ app initialize。callback 完了前は unauthenticated にしない |
| `js/access.js` | `effectiveAccess` の純粋関数。Store ではない |
| `js/app.js` | 既存制作アプリ。`initializeConteRush` / `resetConteRushSession`。Supabase SQL は書かない |
| `index.html` / `css/style.css` | Gate / Account の最小 UI |
| `docs/supabase-m11.sql` | テーブル / RLS / paid fixture 例。M11.3 列と event 表を含む |
| `docs/supabase-m11-1-internal.sql` | 社内利用権の付与 / 解除（email 参照。SQL Editor のみ） |
| `docs/supabase-m11-3.sql` | 既存プロジェクト向け M11.3 ALTER（price_id、event 表、unique index） |
| `docs/supabase-m11-invite.sql` | M11.6 招待コード表 / 生成 / 無効化 |
| `supabase/functions/stripe-webhook/index.ts` | Stripe webhook。secret は Function env のみ |
| `supabase/functions/redeem-internal-invite/index.ts` | 招待コード redeem。JWT 必須。コード平文は env に置かない |

`js/access-store.js` は作らない。利用権の正は Supabase。

### 19. セキュリティレビュー（M11.0）

| 項目 | 方針 |
|---|---|
| クライアントから自分を internal にできないか | RLS で INSERT/UPDATE なし。`enabled` を JS で変えても表は変わらない |
| クライアントから paid を書けないか | 同上。fixture は service role / SQL のみ |
| service role 漏洩 | ブラウザと repo に置かない。M11.0 では導入しない |
| Auth なしで app initialization できないか | Gate が `allowed` になるまで initialize しない |
| access check 失敗時に fail-open しないか | `network_error` ではアプリを開かない。ただし `denied` にもしない |
| ログアウト後に前ユーザーの制作データが残らないか | `clearSessionData` + PDF 破棄 |

原則は fail-closed。`network_error` を未契約と誤表示しない。

静的 SPA の残差: 改変した JS で Gate を外せる。サーバー上の制作ファイルは無いので、M11.0 が守るのは entitlement データの改ざんと、通常 UI での未許可利用である。エッジでの強制は Cloudflare 移行後の余地とする。

### 20. 完成条件（実装時）

当時の M11.0 完成条件。課金の現行は M11.4。Live は M11.8。

- Magic Link でログインできる（暫定。D119 / D125。custom SMTP 後は数字 OTP へ戻せる）
- リロード後、既存 session があればログイン画面を必須にしない
- `internal` fixture で本体を使える
- `paid` fixture（`manual_fixture`）で本体を使える
- 行の無いログイン済みユーザーは `denied` になり、本体を初期化しない
- 通信失敗は `network_error` であり、`denied` と同一文にしない
- クライアントから internal / subscriptions を変更できない
- service role がフロントに無い
- ログアウト後に PDF / Panel / Timeline / Drawing が残らない
- 制作ファイルを Supabase へ送っていない
- Stripe / Checkout / webhook / OAuth / Cloudflare 必須化 / repo private 化をしていない

実接続確認（M11.0・記録）:

- Magic Link メール送信成功
- Magic Link から conte-rush へ復帰成功
- Supabase session 取得成功
- 利用権なし → `denied` 表示成功
- `internal_users` に `enabled=true` を登録後、本体へ入れることを確認済み

### 21. M11.0 では実装しない

- Stripe、クレジットカード、月 100 円商品、Checkout、webhook、解約、Billing Portal（後続 M11.2〜M11.4。Live は M11.8）
- Cloudflare 移行、GitHub private 化
- 管理画面、Google OAuth
- プロジェクト保存、クラウド素材保存
- `profiles`、`access_type` 正本カラム
- 社内版 / 公開版の機能分岐
- Landing Page の大規模化

### 22. M11.1 以降との接続

| 後続 | M11.0 が空けておくもの |
|---|---|
| M11.1 | `internal_users` スキーマと RLS。行の追加は SQL Editor（管理 UI は作らない） |
| M11.2 | `denied` 画面の `#denied-upgrade-slot`。当時は Checkout Session API を置かない（現行入口は M11.4） |
| M11.3 | `subscriptions` の列と正規化 status。webhook は service role だけが書く |
| M11.4 | 現行課金経路。Checkout Session + Portal。再確認のフック |
| M11.5 | アプリは静的ファイルのまま。Pages 前提を崩さない。公開ブロッカーではない |
| M11.6 | 招待コード。SQL 付与は残す |
| M11.7 | 法務・表示。公開 blocker |
| M11.8 | Stripe Live。公開 blocker |

## M11.2（実装済み・歴史。当時 Test Mode Payment Link。現行課金経路としては廃止）

本節は **M11.2 実装時の正** である。当時の入口は Stripe Test Mode の Subscription Payment Link。

**現行の正は M11.4。** frontend は Payment Link に依存しない。Stripe Dashboard の旧 Link も無効化済み。現行経路:

```
frontend
  → create-checkout-session Edge Function
  → Stripe Checkout Session
  → webhook
  → subscriptions
  → access gate
```

一般ユーザーが Magic Link ログイン → `effectiveAccess = none` →「月額100円で利用する」→ 当時は Test Payment Link へ進む導線だけを足した。

M11.0 / M11.1 の Auth・利用権・RLS は変えない。決済完了後に `subscriptions` へ `active` を書く処理は **M11.3 の webhook** である。M11.2 では支払い成功しても `paid` にしない。

```
Magic Link
  → session
  → access check
  → none → denied + Payment Link
  → Stripe Test Checkout
  → conte-rush へ戻る（まだ none）
```

M11.3 を足すと、同じ決済イベントが `subscriptions` を更新し `allowed` になる。

### 1. 境界

- Stripe 処理は Auth Gate 側（`js/access-gate.js` と必要なら `js/stripe-checkout.js`）
- `app.js` に Stripe を書かない
- クライアントから `subscriptions` を INSERT / UPDATE / DELETE しない
- Cloudflare Functions は使わない。GitHub Pages の静的配信のまま
- repository private 化をしない
- custom SMTP / 数字 OTP 復帰をしない

### 2. なぜ Payment Link か

第一候補は **Stripe Payment Links**（Test Mode）。

| 案 | M11.2 |
|---|---|
| A. Payment Link（Dashboard で作る固定 URL） | **する** |
| B. Checkout Session をフロントから API 作成 | しない |
| C. Stripe.js + secret / restricted key | しない |

案 B を採らない理由: Checkout Session の作成には secret key を置けるサーバーが要る。M11.2 は GitHub Pages のみで、Cloudflare Functions はまだ無い。secret をブラウザへ置くことは禁止（D111）。

Payment Link の URL 自体は公開してよい。secret key / restricted key / webhook secret はフロントにも repo の runtime-config にも置かない。

### 3. 商品（Test Mode のみ）

本番 Product / Price は作らない。年額・複数料金・トライアルは作らない。

| 項目 | 値 |
|---|---|
| Product 名 | `conte-rush` |
| Price | `100` JPY（ゼロ小数通貨なので `unit_amount = 100` は 100 円） |
| Recurring | `month` |
| quantity | `1`（顧客による数量変更はオフ） |

表示は「月額100円」。税の自動計算は導入しない（後述）。

### 4. Payment Link

Stripe Dashboard で上記 Price を 1 件だけ載せた **Subscription** Payment Link を Test Mode で作る。

conte-rush の `denied` から遷移する。共有するベース URL は `runtimeConfig.stripePaymentLinkUrl`（例: `https://buy.stripe.com/test_...`）。

クエリはアプリが毎回付ける。Dashboard 側に固定の `client_reference_id` を焼き込まない。

### 5. user 紐付け（必須）

決済と Supabase user の正の紐付けは **`client_reference_id` = `session.user.id`（UUID）**。

例:

`https://buy.stripe.com/test_xxx?client_reference_id=<USER_UUID>`

メールアドレスを `client_reference_id` にしない。email だけで利用権を付けない。

Stripe 現行仕様: `client_reference_id` は英数字・ハイフン・アンダースコア、最大 200 文字。無効値は静かに落ちるが Checkout 自体は動く。[Payment Link URL parameters](https://docs.stripe.com/payment-links/url-parameters)

Supabase Auth の UUID（8-4-4-4-12 のハイフン付き）はこの集合に入る。M11.3 は `checkout.session.completed` の `client_reference_id` を `subscriptions.user_id` と照合する。

生成は文字列連結にしない。`URL` + `URLSearchParams` で、既存クエリがあっても壊さない。

`client_reference_id` の値は **今の session の `user.id` だけ**。DOM 入力・URL クエリ・localStorage から任意 id を読まない。session が無ければボタンを出さない / 遷移しない。

### 6. email prefill（補助）

Stripe 現行仕様で Payment Link に `prefilled_email` を付けられる。顧客は編集できる。`locked_prefilled_email` もあるが、M11.2 では使わない（typo 修正を塞ぎ、email を権限の正に見せてしまう）。

[Customize Payment Links](https://docs.stripe.com/payment-links/customize)

- 付ける値: 今の session の email。無ければパラメータを付けない
- URL エンコードは `URLSearchParams` に任せる
- 秘密情報（token、API key）は URL に載せない。email は Stripe が想定する公開クエリであり、利用権の正ではない
- Checkout 上で email が変わっても、M11.3 の照合は `client_reference_id` の user id

### 7. denied UI

既存 `#denied-upgrade-slot` に足す。見出し `conte-rush` とログアウトは残す。無料トライアルは無し。

想定文:

- 利用権がありません
- conte-rushは月額100円で利用できます。
- ［月額100円で利用する］
- ［ログアウト］

社内向け「管理者に連絡」は残してよい。有料化準備中、だけを Payment Link 案内に置き換える。

`stripePaymentLinkUrl` が未設定 / placeholder ならボタンを出さない（または disabled + 短い説明）。secret が無いことを理由に Checkout Session へフォールバックしない。

### 8. access 別の挙動

| `effectiveAccess` | 課金ボタン | 本体 |
|---|---|---|
| `internal` | 出さない | 無料で利用。Stripe へ誘導しない |
| `paid` | 出さない | 通常利用 |
| `none` | 出す（session あり、Payment Link URL 設定済み） | 出さない |
| `network_error` | 出さない | 出さない。Checkout へ誤誘導しない |

### 9. 完了後 / キャンセル

Payment Link の完了後は Checkout Session API の `success_url` / `cancel_url` ではない。Dashboard の **After the payment**（API では `after_completion`）で決める。[After a payment](https://docs.stripe.com/payment-links/post-payment)

M11.2 の設定:

- Confirmation page を出さず、**リダイレクト**
- URL 例: `https://mook-hary.github.io/conte-rush/?checkout=success`
- 開発用に別 Link を作るなら `http://localhost:8080/?checkout=success`。1 つの Payment Link の `after_completion` は 1 URL

`{CHECKOUT_SESSION_ID}` をリダイレクト URL に埋め込めるが、session 取得には secret が要る。M11.2 では **使わない**。クエリだけで `paid` にしない。

**キャンセル:** Payment Link に Checkout Session 相当の `cancel_url` は無い。ユーザーがタブを閉じるか Stripe ページを離れる。専用の `checkout=cancel` は必須にしない。戻ってきたときは通常の access check。

`checkout=success` は **案内だけ**（D123 / D129）。M11.3 では「決済を確認しています」と再確認。query では `paid` にしない。

その後 query を `history.replaceState` で外す。表示しても `effectiveAccess` の正は `subscriptions` 行である。

### 10. runtime config

公開してよい値だけ:

```
supabaseUrl
supabaseAnonKey
stripePaymentLinkUrl
```

`stripePaymentLinkUrl` は Payment Link のベース URL。未設定でもアプリは起動する（denied でボタンが出ない）。仕様段階では空でよい。

置いてはいけないもの: Stripe secret / restricted key / webhook secret / service role。

### 11. M11.3 への接続

M11.2 の Payment Link は、完了時の Checkout Session に `client_reference_id` が残ることが必須。

M11.3 が聞く想定イベント（実装は M11.3）:

- `checkout.session.completed`（`client_reference_id` → `user_id`。`customer` / `subscription` を保存）
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

M11.2 のブラウザは `customer_id` / `subscription_id` / `status` を書かない。Payment Link の subscription は、既存 Customer を指定しないため **新しい Customer が毎回作られる**（Stripe ドキュメント）。これが二重契約の温床になる。

### 12. 二重契約（Payment Link の限界）

M11.2 では none ユーザーがリンクを何度も開けることを完全には防げない。同じ Payment Link を人数制限で 1 回払いにはしない（全員が使う共有リンクだから）。

限界として残す:

- 既存 subscription の確認なし
- Customer 再利用なし
- サーバー側 Checkout 生成なし

M11.3 以降の進化余地: 既存 subscription 確認、Customer 再利用、Checkout Session をサーバーで作る。これは M11.4 で Supabase Edge Function として実装した（Cloudflare Functions は使わない）。M11.2 ではサーバー処理を足さない。

### 13. 支払方法

カード中心。Dashboard の Payment methods 既定（カード、条件が揃えば Apple Pay / Google Pay）に任せる。コンビニ払い等は M11.2 で足さない。月 100 円は最低手数料と相性が悪い手段がある。

Stripe Tax / 自動税計算は導入しない。Adaptive Pricing（Payment Link 既定の現地通貨表示）は Dashboard に従うが、Price の正は JPY 100。本番前に確認する。

### 14. 税と法務

M11.2 Test Mode の見せ方: **税込 100 円** として UI に書く。インボイス・軽減税率・課税事業者の扱いは決めない。

正式有料公開前の Must は M11.7（法務・表示）と M11.8（Stripe 本番モード）。M11.2 では実装しない。Test Mode の「税込100円」は仮の見せ方である。

### 15. セキュリティ

| 項目 | 方針 |
|---|---|
| 任意 user id を Checkout に付けられないか | `client_reference_id` は `session.user.id` のみ |
| クライアントから paid を書けないか | RLS どおり SELECT のみ。M11.2 で書き込み API を足さない |
| secret 漏洩 | ブラウザと runtime-config に置かない |
| `checkout=success` で allowed にしないか | query は案内だけ。正は `effectiveAccess` |
| email で利用権を付けないか | prefill のみ。照合は UUID |
| Payment Link URL の共有 | ベース URL は公開可。`client_reference_id` 付き URL は本人向け。秘密は載せない |

### 16. 実装時のファイル候補

| ファイル | 役割 |
|---|---|
| `js/runtime-config.js` | `stripePaymentLinkUrl` を足す |
| `js/stripe-checkout.js`（任意） | URL 生成だけ。secret を読まない |
| `js/access-gate.js` | denied スロット、none だけボタン、success 案内 |
| `index.html` / `css/style.css` | 文言とボタン |
| 正本 5 点 | 本節 |

`app.js` に Stripe を入れない。DB / RLS / `clearSessionData` を変えない。

### 17. Dashboard 操作（実装時にユーザーが行う）

現行 Dashboard（[Payment Links](https://dashboard.stripe.com/payment-links)、[作成](https://dashboard.stripe.com/payment-links/create)）:

1. [Stripe](https://dashboard.stripe.com) アカウントを作る（未作成なら）
2. 画面右上（または左）の **Test mode** がオンであることを確認する。Live にしない
3. **Product catalog**（製品カタログ）→ 製品を追加。名前 `conte-rush`
4. 価格: 定期課金、毎月、通貨 JPY、金額 `100`。トライアルなし
5. **Payment links** → **+ New**（または + → Payment link）。既存製品 `conte-rush` を選ぶ。数量変更はオフ。顧客が金額を選ぶモードにはしない
6. **After the payment**: 確認ページではなくウェブサイトへリダイレクト。URL は GitHub Pages（例: `https://mook-hary.github.io/conte-rush/?checkout=success`）。localhost で戻したいときは別 Link を同じ Price で作る
7. 作成後、**Copy** でベース URL（`https://buy.stripe.com/test_...`）を取る。Copy の URL parameters で固定 `client_reference_id` を焼き込まない（アプリが付ける）
8. `js/runtime-config.js` の `stripePaymentLinkUrl` にそのベース URL を入れる
9. テストカードで払う（例: `4242 4242 4242 4242`、将来の期限、任意 CVC）。M11.2 単体では戻っても本体は開かない。M11.3 導入後は webhook 反映で `paid` になり得る（query だけでは付かない）

支払方法の追加（コンビニ等）は **Settings → Payment methods** で M11.2 では増やさない。Stripe Tax はオフ。

### 18. 完成条件（実装時）

- none のログインユーザーが「月額100円で利用する」で Test Payment Link へ進む（URL 設定後）
- URL に `client_reference_id=<そのユーザーの UUID>` がある
- 可能なら `prefilled_email` がある
- internal / paid に課金ボタンが無い
- session 無しでは進まない
- テスト決済後、Pages または localhost に戻り、まだ `denied` である
- `checkout=success` だけでは `allowed` にならない
- `subscriptions` をクライアントが書いていない
- secret / webhook secret がフロントに無い
- Stripe 本番モード、webhook、Billing Portal、解約、Cloudflare Functions、repo private 化をしていない

### 19. M11.2 では実装しない

- webhook、`subscriptions` への Stripe 反映
- Stripe secret API、Checkout Session 作成
- Cloudflare Functions
- Billing Portal、解約、支払い失敗処理
- Customer 再利用、二重 Subscription 防止
- 本番決済、GitHub private 化
- custom SMTP、数字 OTP 復帰
- Stripe Tax、コンビニ決済の追加、年額プラン
- 特商法・利用規約ページ（公開前 Must。実装は M11.7）

## M11.3（実装済み・Test Mode）

Stripe の Subscription 決済を webhook で受け、`public.subscriptions` をサーバー側で更新する。既存の `effectiveAccess` が `paid` を返せるようにする。本節が実装時の正である。

当時の入口は M11.2 Payment Link。**現行の入口は M11.4 の Checkout Session。** webhook の役割は同じ。Live 切替は M11.8。

```
当時: Payment Link（M11.2）→ Stripe Test Checkout → stripe-webhook → subscriptions
現行: create-checkout-session（M11.4）→ Stripe Checkout Session → stripe-webhook → subscriptions
  → ユーザーが ?checkout=success で戻る
  → 通常の access check（query では paid にしない）
  → none なら「決済確認中」+ 再確認（自動は 1 回）
```

M11.0 / M11.1 の Auth Gate、RLS SELECT-own、`PAID_STATUSES`、`clearSessionData`、app initialize 条件は変えない。M11.2 当時の Payment Link URL 生成は M11.4 で frontend から外した。

### 1. 境界

- 書き込みの正は Stripe webhook。ブラウザは自分の行を SELECT するだけ
- secret / `whsec_` / `sk_test` / service role は Edge Function secret のみ
- GitHub Pages は静的のまま。Cloudflare Functions は使わない
- `checkout=success` だけでは `allowed` にしない
- 1 ユーザー 1 `subscriptions` 行（`user_id` PK）

### 2. イベント

処理する:

| イベント | 処理 |
|---|---|
| `checkout.session.completed` | `client_reference_id`（UUID）を `user_id` にする。`customer` / `subscription` を保存。可能なら Subscription を retrieve して status を書く |
| `customer.subscription.created` | 既存行を `subscription_id` → `customer_id` で探す。無ければ無視 |
| `customer.subscription.updated` | 同上。live retrieve して status / period / price / `cancel_at_period_end` を更新 |
| `customer.subscription.deleted` | 同上。status=`canceled` |

未知イベントと `invoice.*` は 200 で無視（invoice は M11.4）。署名不正は 400。紐付け不能（UUID 不正・欠如・行なし）は 200 で書かない。

### 3. access

`active` / `trialing` だけ paid。`past_due` / `canceled` / `unpaid` / `incomplete` / `paused` は none。internal は課金より優先。`current_period_end` と `cancel_at_period_end` は権限の正にしない。

### 4. 重複

`stripe_webhook_events` に `event.id` を処理成功後へ入れる。同一 event は再実行しない。subscription の正は可能な範囲で Stripe retrieve。

### 5. UX

`?checkout=success` でまだ none なら denied のまま「決済を確認しています。反映まで数秒かかることがあります。」と［利用権を再確認］。自動再確認は約 4 秒後に 1 回だけ。無限 polling はしない。

### 6. ファイル

| ファイル | 役割 |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | 署名検証と upsert |
| `supabase/functions/_shared/stripe-webhook-map.js` | status / UUID / period の写像 |
| `supabase/config.toml` | `verify_jwt = false` |
| `docs/supabase-m11-3.sql` | 既存プロジェクト向け ALTER |
| `js/access-gate.js` | 確認中コピーと再確認 |
| 正本 5 点 | 本節 |

### 7. 完成条件

- Test 決済の webhook が `subscriptions` を `provider=stripe` かつ paid 条件の status で更新する
- 既存 `effectiveAccess` が `paid` を返し本体が開く
- `checkout=success` だけでは paid にしない
- 署名不正は 400。secret がフロントに無い
- internal は課金と独立して allowed
- canceled / past_due は none

実機確認（M11.3・Test Mode・記録）:

- none ユーザーの Magic Link / PKCE ログイン、denied、当時は Test Payment Link、Test Card 決済成功。現行入口は M11.4 Checkout Session
- Stripe webhook が Edge Function に到達し `public.subscriptions` を更新
- `paid` で本体へ入れる。reload 後も、`checkout` query 無しの通常 URL でも維持する
- `checkout=success` は案内であり、権限の正ではない

### 8. M11.3 では実装しない

- Stripe 本番モード（M11.8）、Billing Portal（M11.4 で実装）、past_due 猶予（採用しない）
- invoice イベント処理、Customer 再利用、サーバー側 Checkout Session
- Cloudflare Functions、repo private 化
- `effectiveAccess` / RLS の変更

## M11.6（実装済み・公開環境で実機確認済み）

ログイン済みユーザーが社内招待コードで自分を `internal_users` に登録する。メールの事前収集は不要。本節が実装時の正である。

```
Magic Link
  → none → denied
  → 招待コード入力
  → redeem-internal-invite（JWT）
  → internal_users upsert（service role）
  → checkAccess
  → internal → allowed
```

M11.1 の SQL 付与 / 解除は残す。`effectiveAccess`、Stripe webhook、PKCE は変えない。課金経路は M11.4（本マイルストーンでは触らない）。

### 1. 境界

- コード平文は repo / runtime-config / HTML / JS に置かない
- user_id は JWT のみ
- `internal_users` への write policy は authenticated に付けない
- 成功後は DB 再取得が正。local を internal にしない
- paid の `subscriptions` は削除しない。internal が優先

### 2. コード

形式 `CR-XXXXX-XXXXX`。文字は `0/O/1/I/L` を除く。正規化は trim + 大文字 + ハイフン/空白削除。hash は正規化文字列の SHA-256 hex。max_uses 初期 20。expires_at なし。無効化は `enabled = false`。

### 3. Function

`redeem-internal-invite`。`verify_jwt = true`。user_id は `auth.getUser()` のみ。誤コードは `invalid_code`。15 分 8 回失敗で `rate_limited`。既に internal なら `{ ok: true }` で use_count 不変。consume と `internal_users` upsert は `apply_internal_invite`（service_role、1 トランザクション）で行う。subscription は触らない。

### 4. UI

denied に「社内からコードを受け取った方」と入力。一般向け課金ボタンは残す。

### 5. セキュリティ

- JWT 必須。`auth.getUser()` の id だけを使う。body / query / email の user_id は見ない
- 招待表と `apply_internal_invite` は service_role のみ。authenticated に write policy を付けない
- 平文コードは repo / runtime-config / Function env に置かない。DB は hash のみ
- 失敗理由は `invalid_code` に揃える。15 分 8 回で 429
- paid の subscription 行は変更しない
- 成功後は既存 `checkAccess` が DB を再読込する。クライアントだけで internal にしない

### 6. 完成条件

- 正しいコードで none → internal → 本体
- 誤コードでは付かない
- 他人の user_id では付けられない
- コードがフロントに無い
- Stripe / PKCE が壊れていない

実機確認（M11.6・記録）:

- 新規ユーザー → Magic Link / PKCE → none → denied で招待コード入力 → `redeem-internal-invite` 成功 → `internal_users.enabled = true` → 「利用権: 社内」で本体へ入る
- reload 後も社内権限を維持する。招待コードは一時的な登録手段。権限の正は DB の `internal_users`
- GitHub Pages 公開 URL（`https://mook-hary.github.io/conte-rush/`）で一連の経路を確認済み。社内配布可能な状態。メールアドレスの事前収集は不要

## M11.4（実装済み・Test Mode で実機確認済み）

第一目的は **同一 Supabase user が、意図せず同一 conte-rush Price の Subscription を複数契約できないこと** である。Billing Portal はそのための契約管理である。目標モデルは 1 user → 1 Stripe Customer → 0 または 1 Subscription。

```
GitHub Pages
  → JWT
  → create-checkout-session
  → pg_advisory_xact_lock を Stripe 確認〜Session 作成まで保持
  → Customer 1 件を再利用 / 作成
  → 既存契約があれば Checkout を作らない
  → 無ければ Checkout Session
  → webhook が subscriptions を更新
```

共有 Payment Link は廃止する（frontend 撤去済み。Dashboard の旧 Link も無効化済み）。`effectiveAccess` / `PAID_STATUSES` / PKCE / 招待コードは変えない。

### 1. モデル

Supabase user 1 : Stripe Customer 1 : conte-rush Subscription 0 または 1。

正の Customer 対応は `stripe_customers`。`subscriptions` は 1 user 1 行のまま。

### 2. Checkout

`create-checkout-session`。`verify_jwt = true`。user_id は `auth.getUser()` のみ。Price は env `STRIPE_PRICE_ID`。body の user_id / customer_id / price_id は無視。

lock は Postgres トランザクション内の `pg_advisory_xact_lock`。**Stripe `subscriptions.list` と Checkout Session 作成が終わるまで COMMIT しない。** RPC だけ先に終えてから Stripe を呼ぶ実装は禁止。

既存 blocking（`active` / `trialing` / `past_due` / `unpaid` / `incomplete` / `paused`、および `cancel_at_period_end` 中の active）では新しい Subscription を作らない。open Session があればその URL を返す。`canceled` のみ再契約可。

Idempotency-Key: `conte-rush-checkout:{user_id}:{price_id}`。

### 3. Portal

`create-portal-session`。本人の `stripe_customers.customer_id`（無ければ `subscriptions.customer_id`）。共有 Portal URL は使わない。独自解約 API は作らない。`return_url` は許可 origin のみ。

### 4. webhook

blocking な別 `subscription_id` がある行は上書きしない。紐付けは `subscription_id` / `customer_id` / `stripe_customers` / metadata `supabase_user_id` / `client_reference_id`。

### 5. access / UX

paid 条件は従来どおり `active` / `trialing`。`past_due` / `unpaid` / `incomplete` / `paused` は none。猶予期間は設けない。Portal で支払方法を更新する。

- none / canceled: ［月額100円で利用する］。税込・自動更新・解約可・期間末まで利用、を短く出す
- past_due / unpaid / incomplete / paused: 新規 Checkout ではなく［契約を管理］
- paid: Account に［契約を管理］
- internal: 優先のまま。Stripe 契約があっても自動解約しない。Customer があるときだけ［契約を管理］
- `checkout=success` は案内だけ

### 6. 完成条件

- 同一 user が同一 Price の active Subscription を複数作れない
- Customer は 1 件に再利用される
- Payment Link URL が frontend / runtime-config に無い
- 連打・複数タブでも新しい Session を重ねない（lock + open Session 再利用 + Idempotency-Key）
- secret がフロントに無い

実機確認（M11.4・Test Mode・記録）:

- paid ユーザー: 既存 subscription を検出し `existing_subscription`。新規 Checkout を作らない。「契約を管理」→ Customer Portal → アプリへ戻る
- 新規ユーザー: Checkout Session（¥100/月）→ Test 決済 → webhook → `paid` → 本体。再呼び出しでも `existing_subscription` で二重契約へ進まない
- Payment Link は frontend / runtime-config から外した。Stripe Dashboard の旧 Link も無効化済み
- Function secret の Price 不一致で Checkout が失敗することを確認し、正しい Price へ直してから上記を通した
- post-cleanup: orphan Test Customer を Dashboard で削除し、DB 参照は残っていない。残る `stripe_customers` / `subscriptions` は 1:1 で blocking 重複なし

### 7. M11.4 では実装しない

- Stripe 本番モード（M11.8）、特商法ページ（M11.7）
- past_due 猶予（採用しない。M11.8 でも実装しない）
- 重複 Test subscription / 余分な Test Customer の自動キャンセル（整理は Dashboard。post-cleanup で orphan は削除済み）
- Cloudflare Functions

## M11.7（計画。未着手。正式公開 blocker）

有料サービスとして正式公開する前に必要な表示・文書を揃える。課金モデル（M11.4）は変えない。本節は計画であり、この同期では実装しない。

### 1. Must

- 特定商取引法に基づく表記
- 利用規約
- プライバシーポリシー
- 解約方法
- 税込価格表示
- 問い合わせ先
- Gate / Account 等から必要文書へ到達できる導線
- 税務 / 会計上の確認事項を docs 上で明示

### 2. 完了条件

- 各文書が公開 URL で閲覧可能
- 課金前に価格・自動更新・解約条件が確認できる
- 必要な画面から法務文書へ到達できる
- Test 用の仮表示が本番課金画面に残らない

### 3. M11.7 では実装しない

- Stripe Live 切替（M11.8）
- Cloudflare Pages（M11.5）
- past_due 猶予
- 管理画面

## M11.8（計画。未着手。正式公開 blocker）

M11.4 で完成した課金モデルを Stripe Live Mode へ移行する。`PAID_STATUSES`、Customer 1:1、blocking による二重契約防止、past_due 非猶予は変えない。本節は計画であり、この同期では実装しない。

依存: M11.4（済）、M11.7。

### 1. 予定作業

- Live Product / Live Price
- Live webhook endpoint / Live webhook secret / Live Stripe secret
- `STRIPE_PRICE_ID` の Live 化
- Checkout Session / Billing Portal / webhook → subscriptions / access gate の Live 確認

### 2. Live E2E

1. 新規一般ユーザー
2. Checkout
3. 実カード決済
4. webhook
5. paid access
6. `existing_subscription` による二重契約防止
7. Billing Portal
8. `cancel_at_period_end`
9. 期間終了 → none
10. canceled 後の再契約

`past_due` / `unpaid` は可能な範囲で確認する。grace period は実装しない。

### 3. 完了条件

- Live で 1 user : 1 customer : 0/1 blocking subscription
- 実決済から利用権反映まで確認
- 解約と再契約確認
- secret が frontend / tracked files に存在しない
- Test Mode の ID / secret を本番経路で参照しない

### 4. M11.8 では実装しない

- past_due 猶予
- Cloudflare Pages / Functions（M11.5）
- 法務文書の新規起草（M11.7）
- Test データの一括自動キャンセル

## UI 要件




### M0（実装済み）

- ファイル選択
- 選択中のファイル名（選択後）
- PDF 描画領域
- 前ページボタン
- 次ページボタン
- 現在ページ / 総ページ数
- 未選択時の案内
- 読み込み失敗時のメッセージ

### M1（実装済み）

- PDF canvas の上に重ねる操作レイヤー
- ドラッグ中の仮矩形
- 現在ページの登録済み Panel 枠
- 全 Panel の一覧
- 一覧からの削除

### M2（実装済み）

- 一覧各行の確認用サムネイル
- 生成中・失敗時に判別できる表示

### M3（実装済み）

- Panel 一覧での複数選択
- Cut 作成（CUT 番号、秒、コマ）
- Cut 一覧
- Cut の編集・削除、所属 Panel の付け外し

### M4（実装済み）

- Cut を選んで Timeline を編集する欄
- 所属 Panel ごとの startFrame 数値入力
- 配置完了 / 未配置の区別
- 導出した表示区間の確認

### M5（実装済み）

- PDF とは別の Rush プレビュー
- 現在 Panel 画像、CUT 番号、local / global フレーム
- 先頭へ戻る / Play / Pause
- 未完成 Cut の拒否理由
- 画像準備中・画像準備失敗の表示

### M5.1（実装済み）

- PDF 表示枠の直下にあるページ送り
- 高密度な Cut 1行一覧（CUT番号、尺、frames、所属数、完成状態）
- 一覧とは別の Cut 詳細編集ペイン
- CUT番号 / 尺の個別クリア

### M5.2（実装済み）

- 「新規 Cut」と「CUT nnn を編集中」の別フォーム
- 左カラムの横 Timeline バー
- 配置済み Panel のドラッグ可能な開始マーカー
- ドラッグ中の候補 frame 表示
- 未配置 Panel の別リスト（数値「配置」）
- 導出区間の確認

### M5.3（実装済み）

- PDF 上の常設選択フレーム
- 枠内部ドラッグでの移動と、四隅ハンドルでのリサイズ
- 「16:9を維持」
- 「画像取得」
- `frame` / `drag` の 2 系統
- Undo / Redo ボタン
- 選択フレームは stamp 専用 UI を置かない
- 画面高さ不足時のページ縦スクロール
- 未配置 Panel を選んで横 Timeline へクリック / ドラッグして初回配置
- 選択中マーカーの矢印キー微調整（1f / Shift 5f）

### M5.4（実装済み）

- Timeline 開始位置の `1+18（42f）` 併記
- 横マーカーの秒+コマ / frame 2 段表示
- 数値 start 入力横の `= 1+18` 補助（入力は整数のまま）
- 導出区間の秒+コマ主・frame 補助
- 横バー定規の左端（有効 0）と右端（排他総尺）の併記
- Rush の Local / Global ラベル付き秒+コマ併記
- Cut 新規作成時の所属順均等配置（短尺では未完成のまま）

### M6（実装済み）

- Cut 詳細の Motion 欄
- Panel ごとの Motionなし / 導出ラベル
- PAN / TU / TB プリセット
- Panel 画像上の START / END 16:9 枠
- Rush の 16:9 canvas プレビュー（Motion 時は crop、なし時は contain）

### M7（実装済み）

- Rush 付近の「MP4を書き出す」
- 書き出し中の「キャンセル」
- 準備中 / エンコード中（frame 進捗と %）/ 完了 / エラーの表示

### M8（実装済み）

- 同一 Panel の複数 Timeline マーカー（placementId で識別）
- 所属 Panel からの再配置（[追加]）
- 配置 1 件の削除
- Repeat（共通 holdFrames、所属順、確認のうえ置換）
- Repeat の Undo / Redo（Timeline 全体）

### M9（実装済み）

- Cut 詳細のタイムシート欄（話数 / タイトル）
- タイムシートをプレビュー（シート送り）
- B4 縦タイムシート PDF の書き出し
- Motion の前FIX / 後FIX（整数 frame、秒+コマ補助）

### M10.0 / M10.1（実装済み）

- 「手描きPanel」「画像Upload」（画像取得 / ドラッグの隣）
- 手描き overlay（16:9、ペン / 消しゴム、サイズ、Undo / Redo / 全消去 / 確定 / キャンセル）
- drawing の再編集
- upload の差し替え
- 一覧の「手描き」「画像」ラベル

### M10.2（実装済み）

- Timeline 手描き placement からの [編集]
- Onion の前/次 ON/OFF と opacity
- Panel 一覧からの編集では Onion 無効

### M10.3（実装済み）

- 追加候補のサムネ / Panel 番号 / 種別 / start / ［追加］
- 配置済みのサムネ / 番号 / 秒+コマ / 区間 / ［削除］ / drawing の［絵を編集］
- マーカーと配置済み行の `placementId` 選択同期
- Onion の説明、前後サムネと番号、無い側の理由表示
- 一覧［編集］では Timeline の［絵を編集］へ案内

### M10.4（実装済み）

- 横 Timeline 空白のカーソル追従プレビュー（＋）と挿入メニュー。別＋は置かない
- 追加位置の秒+コマ表示
- 既存 Panel を候補 frame へ placement 追加
- ＋から手描き追加（左右 Onion 初期 ON、確定で Panel+所属+placement）
- 詳細側の従来追加 UI は残す

### M11.0（実装済み）

- 未ログイン時の Auth Gate（conte-rush 見出しと Magic Link フォーム。D119）。本体ワークスペースは出さない
- 利用権確認中 / ネットワークエラー / 利用権なし の各表示。未契約と通信失敗を混ぜない
- `denied` の仮案内。月 100 円ボタンは置かない（当時。現行ボタンは M11.4）
- `allowed` 時の小さい Account（メール、利用権ラベル、ログアウト）
- 「社内版」の常時バナーは置かない

### M11.1（実装済み・運用）

- 社内 5〜6 人を想定。専用管理画面は作らない
- 本人が先に Magic Link で一度ログインする
- 管理者がメールアドレスを指定し、SQL Editor で `auth.users` から `id` を引いて `internal_users` へ入れる
- UID の手コピーはしない。手順は [supabase-m11-1-internal.sql](supabase-m11-1-internal.sql)
- 解除は `enabled = false`（行削除でも可）
- Auth Gate / RLS / ブラウザからの書き込み禁止は M11.0 のまま。service_role をフロントへ置かない

### M11.2（実装済み・歴史。当時 Test Mode Payment Link）

- 当時: `denied` の「conte-rushは月額100円（税込）で利用できます。」と［月額100円で利用する］
- 当時: none かつ session あり、Payment Link 設定済みのときだけ遷移。internal / paid には出さない
- 決済後 `?checkout=success` のテスト案内。これだけでは本体を開かない
- 当時は Billing Portal を置かない。現行の Portal 導線は M11.4

### M11.4（実装済み・Test Mode）

- ［月額100円で利用する］は Checkout Session（Edge Function）。Payment Link は出さない
- past_due 等は［契約を管理］（Portal）。新規 Checkout に進まない
- paid / Customer がある internal は Account から Portal

### M11.6（実装済み）

- denied の招待コード入力。通常の社内付与経路。SQL は fallback

### M11.7（計画）

- 特商法 / 利用規約 / プライバシー / 解約 / 税込価格 / 問い合わせへ、Gate / Account から到達できる

### M11.8（計画）

- Live 課金。Test 用の仮表示を本番画面に残さない

## 非対象

次は M10 でも実装しない。UI もデータも作らない。

- ファイルをウィンドウへドロップして開くこと
- ズーム、回転、フィット表示の切替
- PDF ページのサムネイル一覧（ページ送り用）
- テキスト選択、コピー、検索
- 印刷
- Panel の自動検出
- OCR
- CUT 番号の自動認識
- 確定済み Panel のリサイズ編集
- 確定済み Panel の移動編集
- 選択フレームの回転
- 複数の選択フレーム
- Panel 表示区間の両端リサイズ
- 同じ `startFrame` を自動で空き frame へずらすこと
- `0f` が無くなったときに他 Panel を自動で `0f` へ詰めること
- Repeat 回数入力
- Panel ごとの個別 holdFrames
- placement 単位 Motion
- Repeat 設定の永続化 / 再生モード
- 手動配置直後の連続同一 Panel 自動削除
- Panel の `startFrame` / `endFrame`（Panel 本体および Cut 本体への保存）
- `endFrame` の保存
- 表示区間の永続化
- Panel 同士の切替タイミングの保存
- ディゾルブ等のトランジション
- 再生ヘッドをドラッグすること
- スクラブバー
- ループ再生
- 再生速度変更
- fps 変更 UI
- 23.976 / 30fps
- フルスクリーン
- Cut の並べ替え UI
- 未完成 Cut を飛ばして再生すること
- 未完成 Cut を飛ばして MP4 書き出しすること
- WebM / MOV
- 音声 / BGM / SE
- 1080p 選択、bitrate UI、fps 変更 UI
- hardware / software encoder 選択 UI
- `panelIds` の並べ替え UI
- Cut の作成・削除・番号/尺変更・所属変更の Undo / Redo
- 選択フレームの移動・リサイズ・aspect lock の Undo / Redo
- 履歴の永続化
- 一覧のソート UI / フィルタ UI
- 制作データの localStorage / IndexedDB（Auth session の保持は M11.0 で許可）
- プロジェクト保存
- JSON エクスポート
- 切り出し画像のファイル書き出し
- Storyboard Data の完全定義
- AI 解析
- カメラワーク解析
- 秒+コマ形式による `startFrame` 直接入力
- ACTION 自動記入
- CELL B〜F の使用
- タイムシート上での直接編集
- タイムシートの import / Excel / CSV
- 1 Panel 内の複数 Motion 連結
- Panel 表示区間の一部だけにかける Motion
- Motion の `type` フィールド
- Motion の `startFrame` / `endFrameExclusive` 保存
- ease-in / ease-out
- 回転を含むカメラ
- ffmpeg.wasm による書き出し
- `mp4-muxer`
- お絵描きソフト化（色、レイヤー、塗りつぶし、選択範囲、図形、テキスト、筆圧）
- AI 自動 Panel 認識
- 自動中割
- 手描き Canvas を CSS 表示サイズや dpr のまま正本にすること
- drawing / upload への PDF 矩形ダミー
- Onion を Cut.panelIds 順や PDF ページ順で推定すること
- Onion に Motion 適用後の画を使うこと
- Onion を確定画像へ焼き込むこと
- プロジェクトファイル保存、クラウド同期、画像のサーバー Upload
- タイムシート S 欄への文字入力
- PDF なしの手描き専用ワークスペース
- M11.0 での Stripe / Checkout / webhook / 解約 / Billing Portal
- M11.0 での Cloudflare 移行、GitHub repository private 化
- M11.0 での管理画面、Google OAuth、profiles テーブル
- PDF / Panel / Drawing / Upload / Rush / MP4 / Timesheet の Supabase Upload
- 社内版と公開版の機能分岐

## 将来

将来の製品目標は、絵コンテからカット情報を取り出し、ラッシュを自動生成することである。

これは現行仕様ではない。データ上の位置づけだけ [DATA_MODEL.md](DATA_MODEL.md) の将来節に、作業の順序だけ [ROADMAP.md](ROADMAP.md) に書く。

M1 の Panel は、後に Storyboard Data へ入り得るコマ候補である。Storyboard Data 自体はまだ定義しない。

M2 の切り出し関数は、後に OCR などへ同じ矩形画像を渡す入口になり得る。M2 のプレビュー画像そのものを解析入力とはしない。

M3 の Cut は Cut Data の人手入力部分である。開始フレームは持たない。

M4 の Timeline は開始フレームだけである。Rush の再生データは Cut に埋め込まない。

M5 の Rush は再生時の一時構造である。ブラウザ再生までとする。

M5.1 のテンプレートと Cut 選択は UI 状態である。保存しない。

M5.2 の横 Timeline は `startFrame` の編集 UI である。保存構造は増やさない。

M5.3 の常設選択フレームと Undo / Redo は UI 状態である。保存構造は増やさない。履歴はメモリ上のみとする。

M5.4 の秒+コマは表示専用である。保存構造は増やさない。正規値は整数 frame のままとする。

M6 の Motion は独立データである。ブラウザ Rush までとする。

M7 の MP4 は Frame Renderer を共用する書き出しである。保存構造は増やさない。音声とタイムシートはまだ定義しない。

M8 の複数 placement と Repeat は Timeline 編集である。Rush / MP4 は最終 placements だけを見る。

M9 のタイムシートは最終 placements と Motion からの一方向出力である。Store には保存しない。

M10 は Panel 素材の入口を PDF 以外へ広げた。Timeline / Motion / Rush / MP4 / タイムシートの正本関係は変えない。

M11.0 は Auth / 利用権の公開基盤である。制作データのクラウド保存はまだ定義しない。

M11.1 は社内利用権の運用である。管理画面は作らず、SQL Editor で email から `internal_users` へ付ける。

M11.3 は Stripe webhook を Supabase Edge Function で受け、`subscriptions` を更新する。GitHub Pages は静的のままである。

M11.6 は招待コードによる internal セルフ登録である。平文は repo に置かない。公開環境で確認済みであり、社内配布可能な状態である。

M11.4 は現行の課金経路である。Payment Link をやめ、サーバーが Checkout Session を作る。Customer は 1 user 1 件。Dashboard の旧 Link は無効化済み。post-cleanup 済み。

M11.5 は Cloudflare Pages の検討である。正式有料公開の blocker ではない。GitHub Pages のまま公開してよい。

M11.7 は正式公開前の法務・表示である。公開 blocker。

M11.8 は Stripe 本番モード切替である。公開 blocker。最短公開ルートは M11.7 → M11.8 → 正式有料公開。
