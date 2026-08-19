# 仕様

この文書は、実装済みとして扱う仕様と、扱わない範囲を分けて書きます。将来構想は「将来」節に限ります。

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

責務の境界:

- Panel = PDF 上のコンテ画像領域
- Cut = CUT 番号、総尺、所属 Panel
- Timeline = Cut 内で各 Panel をいつ表示するか（開始フレーム）
- Rush = Cut と Timeline を時間軸に沿って再生したもの（M5 ではブラウザ再生のみ）

M1 の Panel は絵コンテ上の 1 つのコマ候補である。CUT 番号でも尺でもない。

M2 の切り出し画像は確認用プレビューである。OCR や画像解析用の入力そのものではない。

M3 の Cut は所属の関連付けまでである。各 Panel の開始フレームや切替タイミングではない。

M4 の Timeline は開始フレームだけである。再生や `endFrame` の保存ではない。

M5 の Rush は再生時に導出した一時構造である。Cut / Timeline へ埋め込まない。MP4 ではない。

M5.1 の Panel テンプレートと Cut 選択は UI 状態だけである。Panel / Cut には保存しない。

M5.2 の横 Timeline は `startFrame` の編集 UI である。Cut へ開始フレームを埋め込まない。`endFrame` は保存しない。

M5.3 の常設選択フレームと履歴は UI 状態だけである。Panel Data には入れない。履歴はメモリ上のみとする。

M5.4 の秒+コマは表示専用である。保存の正は整数 frame のままとする。秒やコマを別フィールドとしては持たない。

## 制約

- GitHub Pages で動作する静的 Web アプリとする
- HTML / CSS / JavaScript を使う
- ビルドツールやサーバーサイド処理は使わない
- PDF はユーザーが選んだローカルファイルのみを対象とする
- PDF データをサーバーや外部サービスへ送信しない
- PDF の処理はブラウザ内で完結させる
- 表示には PDF.js を使う
- Panel、Cut、Timeline、Rush の再生状態はブラウザのメモリ上のみとする。保存しない
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
- M6 の MP4 素材とは定義しない

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

## 非対象

次は M5.4 でも実装しない。UI もデータも作らない。

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
- Panel の `startFrame` / `endFrame`（Panel 本体および Cut 本体への保存）
- `endFrame` の保存
- 表示区間の永続化
- Panel 同士の切替タイミングの保存
- ディゾルブ等のトランジション
- PAN / TU / TB 等の時間変化
- 再生ヘッドをドラッグすること
- スクラブバー
- ループ再生
- 再生速度変更
- fps 変更 UI
- 23.976 / 30fps
- フルスクリーン
- Cut の並べ替え UI
- 未完成 Cut を飛ばして再生すること
- 動画生成
- MP4 出力
- WebM
- 音声 / BGM / SE
- `panelIds` の並べ替え UI
- Cut の作成・削除・番号/尺変更・所属変更の Undo / Redo
- 選択フレームの移動・リサイズ・aspect lock の Undo / Redo
- 履歴の永続化
- 一覧のソート UI / フィルタ UI
- localStorage
- IndexedDB
- プロジェクト保存
- JSON エクスポート
- 切り出し画像のファイル書き出し
- Storyboard Data の完全定義
- AI 解析
- カメラワーク解析
- 秒+コマ形式による `startFrame` 直接入力
- タイムシート出力
- Frame Renderer

## 将来

将来の製品目標は、絵コンテからカット情報を取り出し、ラッシュを自動生成することである。

これは現行仕様ではない。データ上の位置づけだけ [DATA_MODEL.md](DATA_MODEL.md) の将来節に、作業の順序だけ [ROADMAP.md](ROADMAP.md) に書く。

M1 の Panel は、後に Storyboard Data へ入り得るコマ候補である。Storyboard Data 自体はまだ定義しない。

M2 の切り出し関数は、後に OCR などへ同じ矩形画像を渡す入口になり得る。M2 のプレビュー画像そのものを解析入力とはしない。

M3 の Cut は Cut Data の人手入力部分である。開始フレームは持たない。

M4 の Timeline は開始フレームだけである。Rush の再生データは Cut に埋め込まない。

M5 の Rush は再生時の一時構造である。MP4 や音声はまだ定義しない。

M5.1 のテンプレートと Cut 選択は UI 状態である。保存しない。

M5.2 の横 Timeline は `startFrame` の編集 UI である。保存構造は増やさない。

M5.3 の常設選択フレームと Undo / Redo は UI 状態である。保存構造は増やさない。履歴はメモリ上のみとする。

M5.4 の秒+コマは表示専用である。保存構造は増やさない。正規値は整数 frame のままとする。
