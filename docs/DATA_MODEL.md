# データモデル

現行の実行時データと、将来構想を混同しない。将来節のエンティティは名前と前後関係だけを示す。フィールド定義も実装もしない。

## 現行

制作データはサーバーを持たない。Panel / Cut / Timeline / Motion / Rush / 画像 / MP4 / Timesheet はブラウザのメモリ上にだけ存在する。リロードすると消える。

M11.0 で足す Auth / 利用権は Supabase 側の最小データである。制作素材とは別境界とする。M11.0 は実装済み。

責務の境界:

- Panel = ラッシュに使える 1 枚のコンテ画像。PDF crop / 手描き / ローカル画像
- Cut = CUT 番号、総尺、所属 Panel
- Timeline = Cut 内で各 Panel をいつ表示するか（開始フレーム）
- Motion = ある Panel 表示区間内で、16:9 出力へどこを crop するか（M6）
- Rush = Timeline + Motion を時間軸に沿って再生したもの（M5 で再生時の一時構造、M6 で描画を Renderer へ、M7 で同じ描画の MP4）

### PdfSession（M0）

開いている PDF を表す。同時に保持するのは 1 件までとする。

| 項目 | 意味 |
|---|---|
| `fileName` | 選択されたファイル名 |
| `fileSize` | バイト数 |
| `pageCount` | 総ページ数 |
| `currentPage` | 表示中のページ番号（1 始まり） |
| `document` | PDF.js が保持するドキュメント（実行時オブジェクト） |

補足:

- ブラウザはローカルファイルのフルパスを渡さない。パスは持たない
- PDF のバイト列は表示のためにメモリ上へ読む。ファイルとしては保存しない
- 別 PDF を開いたら、直前の `PdfSession` は破棄する

### Panel（M1）

絵コンテ上の 1 つのコマ候補を表す。CUT 番号、尺、カット情報ではない。

M1 のアプリ実装は、この定義に従う。M2・M3・M5.1・M5.3 でもこの項目は増やさない。

| 項目 | 意味 |
|---|---|
| `id` | セッション内で一意な識別子 |
| `pageNumber` | 対象ページ（1 始まり） |
| `x` | ページ表示矩形に対する左端（0〜1） |
| `y` | ページ表示矩形に対する上端（0〜1） |
| `width` | ページ表示矩形に対する幅（0〜1） |
| `height` | ページ表示矩形に対する高さ（0〜1） |
| `source` | 生成元。M1 では `"manual"` のみ |

座標:

- 原点はページ表示の左上。右が x+、下が y+
- canvas の実ピクセルや PDF ユーザー空間では持たない
- ウィンドウサイズや描画倍率が変わっても、同じ相対位置を再現する

`id`:

- `crypto.randomUUID()` で生成する
- 使えない場合のみ `panel-` に連番を付けた文字列とする
- 配列の添字は使わない

`source`:

- M1〜M9 の登録値は `"manual"` のみ（PDF 上の手動矩形）
- 将来 `"auto"` を足せる余地は残すが、現行では使わない。M10 でも使わない
- `confidence` は項目に含めない
- `"drawing"` / `"upload"` は次節。PDF 矩形は持たない

持たないもの:

- `cutId`
- `startFrame` / `endFrame`
- 尺
- 画像データ
- テンプレートサイズ
- 登録モード

保持と寿命:

- 開いている PDF に対して複数件持てる
- メモリ上の配列として追加順を残す。同一ページ内の登録順はこの追加順とする
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は破棄しない
- ファイルへ保存しない

一覧の並び（表示専用。ソート UI は持たない）:

1. `pageNumber` の昇順
2. 同一ページ内では登録順

### Panel 画像の切り出し（M2）

Panel から画像を得る処理である。結果を Panel に格納しない。

- 入力: `PdfSession.document` と Panel の相対座標
- 出力: 切り出した画像（canvas 等）。呼び出し側が使う
- 描画先は表示用 canvas ではない
- 倍率は呼び出し側が渡す。M2 のプレビュー用倍率と、将来の解析用倍率を同じ値に固定しない

M2 のアプリ実装は、この境界に従う。

### ThumbnailCache（M2）

一覧表示用のプレビューだけを、メモリ上に持つ。Panel の一部ではない。

| 項目 | 意味 |
|---|---|
| キー | Panel の `id` |
| 値 | 確認用プレビュー画像（Blob URL または canvas） |

寿命:

- 同じ `id` は再生成しない
- その Panel を削除したら破棄する
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す
- ファイルへ保存しない

M2 のプレビューは OCR 用画像ではない。解析が必要になったら、切り出し処理を別倍率で呼び出す。キャッシュ済みプレビューを解析入力とはしない。Rush 表示にも使わない。

### Panel（M10.0 / M10.1・実装済み）

M1 の 6 フィールドは **PDF Panel だけ**維持する。drawing / upload に `pageNumber` / `x` / `y` / `width` / `height` のダミーは置かない。

| `source` | 意味 | 追加フィールド |
|---|---|---|
| `"manual"` | PDF から切った Panel（現行） | `pageNumber`, `x`, `y`, `width`, `height` |
| `"auto"` | 予約。M10 では作らない | 上記と同じ予定 |
| `"drawing"` | 手描きで確定した Panel | なし（画素は MediaStore） |
| `"upload"` | ローカル画像から作った Panel | なし（画素は MediaStore） |

`"manual"` を `"pdf"` に改名しない。手描きの意味にも使わない。

`id` の規則は M1 のまま。Cut / Timeline / Motion はこれまでどおり `panelId` だけを見る。

一覧:

- 表示ラベル: PDF は `ページ n`、drawing は `手描き`、upload は `画像`
- 並び: `listAll` は PDF を `pageNumber` 昇順、同一ページは登録順。drawing / upload は PDF 群の後ろ、登録順。pageNumber が無くても NaN ソートしない
- 登録順が必要なときは `listInRegistrationOrder`
- PDF overlay（`listByPage`）は pdf Panel だけ。drawing / upload はページ枠を出さない

持たないもの（M1 に加え）:

- Panel 上の `image` / `blob` / `strokes`
- `kind` と `source` の二重フィールド

### PanelMediaStore（M10.0 / M10.1・実装済み）

確定した非 PDF 画像。Panel の一部ではない。ThumbnailCache でも RushImageCache でもない。

| 項目 | 意味 |
|---|---|
| キー | Panel の `id` |
| `kind` | `"drawing"` または `"upload"` |
| `blob` | 正本。drawing は PNG。upload は読み込んだファイル（または同等の画像 Blob） |
| `mimeType` | `image/png` / `image/jpeg` / `image/webp` |
| `width` / `height` | デコード後の画素 |

補足:

- 実行時に ImageBitmap をキャッシュしてよい。正本は Blob
- drawing の正本画素は 1280×720
- upload は元画像の画素。16:9 にリサンプルしない
- ファイルへ保存しない

寿命:

- その Panel を削除したら破棄する。Undo 用に history Action が Blob を保持する
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す

### PanelImageProvider（M10.0・実装済み）

`panelId` または Panel から描画可能画像を返す実行時 API。Store ではない。

入力: Panel、`purpose`（`thumbnail` / `rush` / `export` / `motion` / `onion`）、pdf のときだけ `pdfDocument` と任意の `motionMaxScale`

出力: `CanvasImageSource` と画素幅高さ。必要なら object URL

分岐はここだけ。Rush / MP4 / Motion Editor は source を直接切らない。

### DrawingEditorState（M10.1・実装済み）

手描き overlay が開いているあいだだけの UI 状態。Panel Data ではない。`js/drawing-editor.js` が持つ。

| 項目 | 意味 |
|---|---|
| `mode` | `create` または `reedit` |
| `tool` | `pen` / `eraser` |
| `size` | 3 段階（4 / 10 / 20 px） |
| `commands` | 確定前の一筆 / 全消去。editor 内 Undo/Redo。上限 40 |
| `baseline` | 上限超過分を焼き込んだ drawing layer。新規 stroke 用 |
| `backgroundBlob` | 再編集開始時に paper へ載せる確定 PNG。Panel には残さない |

- 一筆 Undo は `history.js` に積まない
- キャンセルでこの状態を捨てる
- ファイルへ保存しない
- 表示: paper（白 + 再編集時の確定 PNG） / reference（Onion） / drawing（新規 stroke）
- 確定 PNG は paper + drawing だけ。reference（Onion）は焼かない

### OnionSkinView（M10.2・実装済み）

手描き編集中の表示状態。保存しない。焼き込まない。

| 項目 | 意味 |
|---|---|
| `prevEnabled` / `nextEnabled` | 前後の ON/OFF |
| `prevOpacity` / `nextOpacity` | 0〜1。初期は約 0.35 |
| `prevPanelId` / `nextPanelId` | `placementId` の隣接 range から導出。無ければ null |
| `cutId` / `placementId` | Timeline から開いたときだけ。一覧編集では無し |

前後は Timeline の隣接 placement であり、PDF ページ順でも `Cut.panelIds` 順でもない。Panel / MediaStore へ保存しない。ON/OFF と opacity は history 対象外。

M10.3 の前後サムネ・Panel 番号・説明文もこの UI 状態だけである。番号は表示用に `Cut.panelIds` の 1-based を読むだけで、前後の解決には使わない。

### M10.3（実装済み）

**M10.3で保存構造変更なし。**

Panel / Cut / Timeline / placement / Motion / PanelMediaStore のフィールドは増やさない。`placementId` の意味も変えない。Timeline 追加候補・配置済み行・Onion 説明は描画時の見え方だけとする。

### InsertionContext（M10.4・UI状態のみ）

横 Timeline の「＋」から新規手描きを開いているあいだだけの一時状態。永続しない。Store に書かない。

| 項目 | 意味 |
|---|---|
| `mode` | `"insert"`。既存 placement 編集の `{ cutId, placementId, panelId }` とは別 |
| `cutId` | 挿入先 Cut |
| `startFrame` | メニューを開いたときに固定した候補 frame |
| `previousPlacementId` / `nextPlacementId` | `neighborsAroundFrame` の結果。無くてよい |

確定するまで Panel / placement は作らない。キャンセルで捨てる。

### M10.4（実装済み）

**M10.4で永続構造変更なし。InsertionContextはUI状態のみ。**

Panel / Cut / Timeline / placement / Motion / PanelMediaStore のフィールドは増やさない。`placementId` は保存後に初めて付く。

### Cut（M3）

CUT 番号、総尺、所属 Panel を表す。各 Panel をいつ表示するかは表さない。

M3 のアプリ実装は、この定義に従う。

| 項目 | 意味 |
|---|---|
| `id` | セッション内で一意な識別子 |
| `cutNumber` | ユーザーが入力した CUT 番号（文字列） |
| `durationFrames` | この Cut の総尺。正の整数（フレーム） |
| `panelIds` | 所属する Panel の `id` 配列 |

例:

```json
{
  "id": "cut-001",
  "cutNumber": "001",
  "durationFrames": 84,
  "panelIds": ["panel-a", "panel-b", "panel-c"]
}
```

`id`:

- `crypto.randomUUID()` で生成する
- 使えない場合のみ `cut-` に連番を付けた文字列とする

`cutNumber`:

- 文字列として扱う
- ユーザーが入力した表記を、基本的にそのまま保持する
- 同一セッション内で、完全一致する値の重複は許可しない
- `"001"` と `"001A"` は別 CUT とする
- 大文字小文字変換、ゼロ埋め、数値化などの自動正規化は行わない

`durationFrames`:

- 尺の正規値はこの項目だけとする
- 秒やコマを別フィールドとしては持たない
- UI の秒+コマとの換算は 1 秒 = 24 フレーム（[DECISIONS.md](DECISIONS.md) の D16）
- 表示は `formatDuration` / `formatDurationLabel`。M5.4 の開始位置表示も同じ換算を `formatFrameTime*` 経由で使う。保存値は増やさない

`panelIds`:

- 「この Panel 群がこの Cut に属している」ことを表す
- 順は Cut へ追加した順（作成時は、その時点の Panel 一覧のうち選択されたものの順）
- 再生順、開始フレーム、表示区間ではない
- 同じ id を重ねない
- 1 つの Panel id は、全 Cut を通して高々 1 つの配列にだけ現れる
- 作成時は 1 件以上。あとから 0 件になっても Cut は残してよい

持たないもの:

- `placements`
- 各 Panel の `startFrame` / `endFrame`
- global 開始 / 終了フレーム
- 表示区間
- 切替タイミング
- トランジション
- PAN / TU / TB（Cut へ埋め込まない。M6 の Motion が独立して持つ）
- 画像
- Timeline 完成フラグ
- 詳細ペインで選んでいる Cut の id

保持と寿命:

- メモリ上のみ。ファイルへ保存しない
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は破棄しない
- Panel を削除したら、すべての `panelIds` からその id を除く
- Cut を削除しても Panel は残す
- Cut の総尺を短くするとき、Timeline に `startFrame >= 新しい durationFrames` の placement があれば、尺の変更を拒否する（M4。placement は消さない）

一覧の並び（表示専用。ソート UI は持たない）:

- Cut の登録順

### Timeline（M4）

Cut 内で各 Panel をいつ表示し始めるかを表す。再生データではない。Cut 本体の一部でもない。

M4 のアプリ実装は、この定義に従う。

| 項目 | 意味 |
|---|---|
| `cutId` | 対象 Cut の `id`。Timeline のキー |
| `placements` | 配置の配列。各要素は `panelId` と `startFrame` のみ |

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

`cutId`:

- Cut 1 件につき Timeline は 0 または 1 件とする
- Timeline 独自の id は持たない

`placements`:

- 扱い順は `startFrame` 昇順とする。追加順でも `panelIds` 順でもない
- 各要素は `panelId` と `startFrame` とする。M8 ではさらに `id` を持つ
- `panelId` はその Cut の `panelIds` に含まれるものに限る
- 同一 Timeline 内で同じ `panelId` を重ねない（M8 で廃止。同一 `panelId` の複数 placement を許す）
- 同一 Timeline 内で同じ `startFrame` を重ねない
- 所属全員が配置されるまで、一部だけでもよい（未完成）

`startFrame`:

- 0 始まりの整数（フレーム）
- `0 ≤ startFrame < cut.durationFrames`
- 秒+コマでは持たない
- M5.4 の秒+コマ表示は描画時に `duration.js` の formatter で導出する。項目は増やさない

表示区間（導出のみ。保存しない）:

- `endFrame` は項目にしない
- `placements` を `startFrame` 昇順に並べる
- i 番目の表示終了（排他）は、次の `startFrame`。最後はその Cut の `durationFrames`
- 表示する終了は inclusive の最終 frame（排他終端 − 1）とする
- 例: 84f で 0 / 36 / 60 なら整数区間は `0–35f`、`36–59f`、`60–83f`
- M5.4 の画面表示例: `0+00–1+11（0–35f）`、`1+12–2+11（36–59f）`、`2+12–3+11（60–83f）`
- 横バー右端の総尺表示は排他終端（84f なら `3+12（84f）`）。区間の終了とは別である

配置完了（Rush に渡せる条件。M4 では再生しない。M8 で条件を更新）:

1. `panelIds` のすべてに、ちょうど 1 件の placement がある（M8 で廃止）
2. いずれかが `startFrame === 0`
3. 各 `startFrame` が整数で `0 ≤ startFrame < durationFrames`
4. 同一 Timeline 内で `startFrame` が重ならない
5. 各 `panelId` がその Cut の `panelIds` に含まれる

1 Panel Cut の初期化:

- Cut 新規作成時は、所属数に応じて M5.4 の均等配置を使う。1 件なら `0f`
- 既存 Cut を Timeline 編集対象として初めて扱うとき、Timeline が未作成で所属が 1 件だけなら、同様に `0f` を自動配置する
- 既存 Cut へ Panel を足しても、既存 placement は再均等しない。足した Panel は未配置とする
- 既存 Timeline がある場合は書き換えない

持たないもの:

- `endFrame`
- 表示区間の保存
- 秒とコマの保存フィールド
- 切替タイミング
- トランジション
- PAN / TU / TB（Timeline へ埋め込まない）
- 再生ヘッド、play / pause、実時間タイマー
- 画像
- 完成フラグ（描画時に `isComplete` から導出する）
- ドラッグ中の候補 `startFrame`（UI 状態のみ。Store には入れない）

保持と寿命:

- メモリ上のみ。ファイルへ保存しない
- Cut を削除したら、その `cutId` の Timeline も破棄する
- Panel を削除したら、すべての Timeline の placement からその id を除く
- Cut から Panel を外したら、その Panel の placement を除く。`panelIds` からの除外は Cut 側の操作とする
- Cut に Panel を足しても、既存 placement は触らない。足した Panel は未配置とする
- Timeline から placement を消しても、`panelIds` からは外さない
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は破棄しない

### Timeline（M8・実装済み）

M4 の `{ cutId, placements }` は維持する。各 placement に `id` を足し、同一 `panelId` の複数件を許す。

| 項目 | 意味 |
|---|---|
| `id` | placement の識別子。編集・Undo・マーカーのキー |
| `panelId` | 表示する Panel |
| `startFrame` | 表示開始（整数 frame） |

一意性:

- `startFrame` は Timeline 内で重複しない
- `panelId` は重複してよい
- `id` はセッション内で一意

配置完了（M8）:

1. placement が 1 件以上
2. いずれかが `0f`
3. 各 `startFrame` が範囲内の整数
4. `startFrame` 重複なし
5. 各 `panelId` が Cut 所属
6. 各 placement に `id`

所属全員が 1 回以上置かれていることは完成条件にしない。未使用の所属はヒントのみ。

持たないもの:

- Repeat の列 / hold / 回数
- 表示区間の保存
- placement 単位の Motion

Repeat は実行時に placements を生成して Store へ書くだけである。UI 状態に確認ダイアログと hold 入力だけを持つ。

Panel 削除 / Cut から外すときは、その `panelId` の placement をすべて除く。0f へ自動詰めしない。

### Motion（M6）

ある Panel の表示区間内で、16:9 の出力フレームへ Panel 画像のどこを crop するかを表す。再生データそのものではない。Panel / Cut / Timeline の一部でもない。

M6 のアプリ実装はこの定義に従う。

| 項目 | 意味 |
|---|---|
| `cutId` | 対象 Cut の `id`。Motion 集合のキー |
| `motions` | 要素は `panelId`、`from` / `to`、`preFixFrames` / `postFixFrames`（無いときは 0） |

`from` / `to`:

| 項目 | 意味 |
|---|---|
| `x` | Panel **画像**内の viewport 中心 X（0〜1） |
| `y` | Panel **画像**内の viewport 中心 Y（0〜1）。下が + |
| `scale` | ズーム。`1.0` = 画像に内接する最大 16:9。大きいほど寄る |

例:

```json
{
  "cutId": "cut-001",
  "motions": [
    {
      "panelId": "panel-a",
      "from": { "x": 0.3, "y": 0.5, "scale": 1.0 },
      "to": { "x": 0.7, "y": 0.5, "scale": 1.4 },
      "preFixFrames": 0,
      "postFixFrames": 0
    }
  ]
}
```

`cutId`:

- Cut 1 件につき Motion 集合は 0 または 1 件とする
- 独自 id は持たない
- `motions` が空なら、集合レコード自体を持たなくてよい

`motions`:

- M6 では同一 `panelId` は高々 1 件
- `panelId` はその Cut の `panelIds` に含まれるものに限る
- 配列なのは、将来 1 Panel に複数区間を足す余地のため
- `type`、`startFrame`、`endFrameExclusive` は持たない
- `preFixFrames` / `postFixFrames` は 0 以上の整数。秒や formatted 値は保存しない。未指定は 0
- PAN / TU / TB は from/to から表示時に導出する

時間（導出のみ。保存しない）:

- 対象 Panel の Timeline 表示区間（`startFrame` … `lastFrame` inclusive）に従属する
- `motionStart = panelStart + preFixFrames`
- `motionLast = panelLast - postFixFrames`
- preFIX は `from` で静止。本体は `motionStart`〜`motionLast` を線形補間。postFIX は `to` で静止
- 本体は最低 2 frame（`motionLast - motionStart + 1 >= 2`）。足りない値は保存しない
- `lastFrame === startFrame` のときは作成・編集しない。既存レコードは残し、再生では適用しない

`scale` と 16:9:

- 画素空間で viewport の幅:高さ = 16:9
- `scale = 1` の窓は、Panel 画像に収まる最大の 16:9
- 窓は画像の外へ出さない。中心はクランプする
- `scale < 1` は持たない

持たないもの:

- Panel / Cut / Timeline への埋め込み
- PDF ページ座標（Panel.x / Panel.y とは別）
- 出力 canvas のピクセル幅・高さ
- 回転、ease、type フィールド
- 永続ファイル

保持と寿命:

- メモリ上のみ。ファイルへ保存しない
- Panel 削除: すべての Motion からその `panelId` を除く
- Cut から Panel を外す: その Cut のその `panelId` を除く
- Cut 削除: その `cutId` の集合を破棄する
- Timeline から placement だけ消しても Motion は残してよい
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は破棄しない

### RushPlayback（M5）

Cut と Timeline から、再生時にだけ導出する一時構造である。永続データではない。Cut / Timeline の一部でもない。

M5 のアプリ実装は、この定義に従う。

| 項目 | 意味 |
|---|---|
| `totalFrames` | 連結した総尺（フレーム） |
| `segments` | 登録順の Cut 区間 |

segment:

| 項目 | 意味 |
|---|---|
| `cutId` | 対象 Cut の `id` |
| `cutNumber` | 表示用。Cut からコピーした値 |
| `durationFrames` | その Cut の総尺 |
| `globalStart` | 全体時間軸での開始（含む）。導出のみ |
| `globalEndExclusive` | 全体時間軸での終了（排他）。導出のみ |
| `placements` | `{ id, panelId, startFrame }`（M7 までは `id` なし）。`startFrame` 昇順 |

例:

```json
{
  "totalFrames": 204,
  "segments": [
    {
      "cutId": "cut-001",
      "cutNumber": "001",
      "durationFrames": 84,
      "globalStart": 0,
      "globalEndExclusive": 84,
      "placements": [
        { "panelId": "panel-a", "startFrame": 0 },
        { "panelId": "panel-b", "startFrame": 36 }
      ]
    }
  ]
}
```

導出:

- 再生順は Cut の登録順
- `globalStart` は直前までの `durationFrames` の合計
- `globalEndExclusive = globalStart + durationFrames`
- `totalFrames` は全 `durationFrames` の合計
- `localFrame = globalFrame - globalStart`
- 表示 Panel は、`startFrame ≤ localFrame` のうち最大の `startFrame`
- `localFrame` / `globalFrame` / `totalFrames` は整数 frame のままとする。秒+コマは Rush Data に入れない
- M5.4 のメーター表示は描画時に `formatFrameTime` する。`rush-player.js` は変えない

再生対象:

- すべての Cut が配置完了であること
- 未完成が 1 件でもあればスナップショットを作らず、再生しない

持たないもの:

- ファイルへの保存
- MP4 / 音声
- トランジション
- 再生速度
- Cut への書き戻し
- 秒とコマの保存フィールド

保持と寿命:

- Play 時に構築する。メモリ上のみ
- 再生中は live の Cut / Timeline を読まない
- M6 では live の Motion も読まない。Play 時に app が Motion を別途凍結する。この snapshot オブジェクトへ Motion は埋め込まない
- dirty な次回 Play で作り直す
- 新しい PDF の読み込み成功時に破棄する

### RushImageCache（M5）

Rush 表示用の Panel 画像だけを、メモリ上に持つ。M2 の ThumbnailCache ではない。Panel の一部でもない。

| 項目 | 意味 |
|---|---|
| キー | Panel の `id` |
| 値 | Rush 表示用画像（Blob URL） |

補足:

- `cropPanelImage(..., { scale: RUSH_SCALE })` で作る。`RUSH_SCALE = 2`
- `PREVIEW_SCALE` とは共有しない
- 同一 `id` は 1 回だけ生成する
- 1 件ずつ生成する
- ウィンドウリサイズでは再生成しない
- MP4 素材とは定義しない。M6 の Renderer はここの画像をソースにする。M7 の書き出しは `ExportImageCache` を使う

寿命:

- その Panel を削除したら破棄する
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す
- ファイルへ保存しない

### UI 状態（M5.1 / M5.2 / M5.3 / M5.4 / M6 / M7 / M10）

Panel / Cut / Timeline / Rush の保存構造ではない。メモリ上の操作状態だけとする。ファイルへ保存しない。`localStorage` にも入れない。

#### PanelTemplate（M5.1）

M5.1 では、前回成功した Panel のサイズだけを覚えた。M5.3 では常設選択フレームが位置とサイズを持つため、この別状態は使わない。

#### PanelPlaceMode

M5.1 では `drag` と `stamp` だった。M5.3 では stamp を常設選択フレームへ統合し、次の 2 値とする。

| 値 | 意味 |
|---|---|
| `frame` | 常設選択フレームで取得する（標準） |
| `drag` | ドラッグで矩形を描いて登録する（別サイズの例外） |

- 初期値は `frame`
- drag 中は常設選択フレームを隠す
- drag で Panel を登録しても、常設フレームの位置・サイズは変えない

M5.3 では使わない（stamp へ統合するため現行 UI から外す）:

- `stamp` モード
- PanelTemplate（前回サイズだけの別状態）
- PanelCandidate（未確定の stamp 矩形）
- 「前回サイズで置く」「この位置で登録」「やめる」

#### SelectionFrame（M5.3）

PDF 上の常設選択フレーム。Panel Data ではない。

| 項目 | 意味 |
|---|---|
| `x` | 左端（0〜1） |
| `y` | 上端（0〜1） |
| `width` | 幅（0〜1） |
| `height` | 高さ（0〜1） |
| `aspectLocked` | 見た目 16:9 を維持するか。初期 `true` |

- 座標は M1 の Panel と同じ。ページ表示矩形に対する相対値。左上原点
- 実行時の正本は `js/panel-overlay.js`。`app.js` は同じ構造の複製を持たない
- 16:9 は overlay の CSS ピクセル見た目である。`width / height === 16/9` ではない
- 初期: 中心 0.5, 0.5、幅 0.45、高さは見た目 16:9、ページ内へクランプ
- 「画像取得」は、この矩形と表示中ページから Panel を作る。作ったあともこの状態は消さない
- ページ送りでは位置・サイズ・`aspectLocked` を維持し、はみ出しだけクランプする
- 新しい PDF の読み込み成功時に初期状態へ戻す。失敗維持時は残す
- 移動・リサイズ・lock 変更は Undo 履歴に入れない

#### History（M5.3）

Undo / Redo のメモリ上スタック。Store ではない。ファイルへ保存しない。

| 操作 | 意味 |
|---|---|
| `push` | 確定した操作を積む。Redo 側は破棄する |
| `undo` / `redo` | 直前操作を戻す / やり直す |
| `canUndo` / `canRedo` | ボタンの有効状態 |
| `clear` | 両方空にする |

必須対象: Panel 登録、Panel 削除、Timeline の `startFrame` 確定、M6 の Motion 作成 / 削除 / from-to 確定。M8 では加えて placement 追加 / 削除、Repeat による Timeline 全置換。M10.1: drawing / upload の追加、drawing 再編集確定、upload 差し替え。一筆ごとの Undo は対象外。

Panel 削除の 1 Action が保持するもの:

- Panel Data 全体
- Panel Store 上の元の挿入位置
- 所属していた Cut と、その `panelIds` 内位置
- Timeline にその Panel の placement があった場合、その全件（`id` と `startFrame`。M8）
- その Panel に付いていた Motion（M6）
- drawing / upload なら MediaStore の Blob（ImageBitmap は持たない）

新しい PDF の読み込み成功時に `clear` する。失敗維持時は残す。

#### SelectedCutId

Cut 詳細ペインの対象。Cut Data の項目ではない。

寿命:

- その Cut を削除したら空にする
- 新しい PDF の読み込み成功時に破棄する

#### TimelineDragCandidate

横 Timeline のドラッグ中だけ持つ UI 状態。Timeline Data ではない。

| 項目 | 意味 |
|---|---|
| `placementId` | 動かしている placement |
| `panelId` | その placement の Panel（表示用） |
| `startFrame` | スナップ済みの候補フレーム（整数） |

- データの正は、ドラッグ開始前の Timeline Store の `startFrame` とする
- pointermove ではこの候補だけを更新する。Store は書かない
- 確定失敗、Esc、pointercancel では破棄し、マーカーと数値欄を保存済み値へ戻す
- 確定成功時だけ Store を更新し、この候補を捨てる

#### TimelinePanelSelection（M5.3）

横 Timeline の行またはマーカーで選んでいる Panel。Timeline Data ではない。

| 項目 | 意味 |
|---|---|
| `selectedTimelinePanelId` | 選択中の `panelId`。未選択はなし |
| `selectedPlacementId`（M8） | 選択中の placement。複数配置後のキー |

- M8 ではマーカー操作の正は `selectedPlacementId`
- ファイルへ保存しない

#### MemberPlacePreview（M8）

所属 Panel を横バーへ追加する操作のあいだだけ持つ UI 状態。Timeline Data ではない。

- バー上のスナップ済み候補 frame を示す
- pointerup の検証成功時だけ Store へ書く。失敗・キャンセルでは破棄する
- すでに同じ Panel の placement があっても追加できる

#### FrameTimeDisplay（M5.4）

整数 frame から描画時に導出する表示文字列。Timeline Data / Rush Data ではない。

- `formatFrameTime` / `formatFrameTimeLabel` / `formatFrameRange` は `js/duration.js` が持つ
- 既存 `formatDuration` / `formatDurationLabel` / `framesToParts` へ委譲する。24 を再定義しない
- 秒やコマを Store やスナップショットへコピーしない
- 数値 `startFrame` 入力の補助 `= 1+18` も、パースできた整数に対する導出だけとする

#### MotionEditorView（M6・仕様）

Cut 詳細の Motion 編集 UI 状態。Motion Data ではない。

| 項目 | 意味 |
|---|---|
| `selectedMotionPanelId` | START/END 枠を出している Panel |
| ドラッグ中の候補 from/to | 確定前の枠。Store には書かない |

- 座標は Panel 画像上。PDF 選択フレームとは共有しない
- ファイルへ保存しない

#### RushMotionFreeze（M6・仕様）

Play 時だけ持つ Motion の複製。RushPlayback snapshot の項目ではない。

- 再生中はこれを読む。live の Motion Store は読まない
- dirty な次回 Play で作り直す
- ファイルへ保存しない

### ExportSnapshot（M7・実装済み）

書き出し開始時に凍結する実行時構造。Store ではない。Panel / Cut / Timeline / Motion の保存フィールドでもない。

含むもの:

- `buildSnapshot` と同じ Cut 登録順セグメント（`totalFrames` を含む）
- Motion 全件の複製（Play 時の freeze と同じ）
- 参照 Panel の複製（PDF は矩形、drawing / upload は source + MediaStore）
- その時点の `pdfDocument` 参照
- PDF ファイル名（保存名の元）

補足:

- 書き出し中は live Store を読まない
- 編集は freeze に入らない。次回書き出しで反映する
- ファイルへ保存しない。完成 MP4 Blob も Store に入れない

### ExportImageCache（M7・実装済み）

720p 書き出し用の Panel 画像。`RushImageCache` ではない。`ThumbnailCache` でもない。

| 項目 | 意味 |
|---|---|
| キー | Panel の `id` |
| 値 | `cropPanelImage` で作った画像（必要 pdfScale） |

補足:

- pdfScale は Panel ごとの Motion 最大 `scale` と 1280 幅から決める。`RUSH_SCALE` は使わない
- 同一書き出し内の同一 `id` は 1 回だけ生成する
- 1 件ずつ生成する

寿命:

- 書き出し開始から完了 / キャンセル / 失敗まで
- 終了時に破棄する。PDF セッションへ残さない
- 新しい PDF の読み込み成功時にも残さない（書き出し中の PDF 差し替えは禁止）

### ExportJob（M7・実装済み）

書き出し UI の実行時状態。保存構造ではない。

| 項目 | 意味 |
|---|---|
| `status` | idle / preparing / encoding / done / cancelled / error |
| `currentFrame` / `totalFrames` | エンコード進捗 |
| `preparedCount` / `prepareTotal` | 画像準備進捗 |
| `cancelRequested` | 次 frame / 次 Panel の前で見る |
| エラーメッセージ | 画面表示用 |

- 同時に 1 件まで
- Play と同時実行しない
- ファイルへ保存しない

### TimesheetModel（M9・導出）

完成 Timeline と Motion から、タイムシート 1 枚分を描くための View Model。保存構造ではない。Store ではない。

| 項目 | 意味 |
|---|---|
| `durationFrames` | Cut の尺 |
| `sheetCount` | `ceil(durationFrames / 144)`。144 は `TIMESHEET_SECONDS_PER_SHEET × FRAMES_PER_SECOND` |
| `panelNumbers` | `Cut.panelIds` 順の 1-based 番号。placement 順ではない |
| `cellRuns` | collapse 後の range。CELL A 列用 |
| `cameraRuns` | Motion ありかつ 2 フレーム以上の range。CAMERA 用 |
| `header.cutNumber` | `cut.cutNumber` |
| `header.durationLabel` | `formatDuration(durationFrames)` |
| `header.episodeNumber` / `title` | PDF セッションの UI 入力。Cut には無い |

変換規則:

- `collapseConsecutive(placements)` を View Model 生成時だけ使う。Timeline Store は変えない
- 内部 cutFrame は 0 始まり。紙面の行は 1〜144。`0f` は sheet 0 の行 1
- シート境界をまたぐ CELL は、次シート先頭行に同じ番号を再表示する
- CAMERA のシート分割は、各シートの重なり先頭に Motion 名と A、真の終了があるシートにだけ B
- UUID は View Model に残してもよいが、PDF へは書かない

### TimesheetSession（M9・UI）

タイムシート出力 UI の状態。Cut Data ではない。

| 項目 | 意味 |
|---|---|
| `episodeNumber` | 話数。複数 Cut で共通になり得る |
| `title` | 作品タイトル |
| プレビューの sheetIndex | 表示中ページ |

- PDF 再選択成功時に初期化する
- 同じ PDF セッション内では Cut を切り替えても保持する
- ファイルへ保存しない

### 持たないもの（現行）

- 永続化した Rush Data
- MP4 / 音声の永続保存
- 自動検出結果
- `source: "auto"`（予約のまま。M10 でも作らない）
- `confidence`
- Panel に埋め込んだ画像、CUT 番号、尺、`cutId`、`startFrame`
- Cut に埋め込んだ `placements` / `startFrame` / global 区間
- Timeline に埋め込んだ `endFrame`
- Panel / Cut / Timeline に埋め込んだ Motion
- Motion の `type` / `startFrame` / `endFrameExclusive`
- ユーザー設定の永続化
- Panel テンプレートの永続化
- 選択フレームの永続化
- Undo / Redo 履歴の永続化
- 横 Timeline ドラッグ候補の永続化
- 秒とコマの保存フィールド
- タイムシート View Model / 話数 / タイトルの永続化
- Storyboard Data の完全なスキーマ
- 制作データの localStorage / IndexedDB（Auth session の保持は M11。制作データではない）
- PDF / Panel / Cut / Timeline / Motion / Drawing / Upload / Rush / MP4 / Timesheet の Supabase 保存

Panel は後に Storyboard Data へ入り得るが、Storyboard Data 自体は未定義のままとする。

### AuthUser（M11.0・実装済み）

Supabase Auth が持つ identity。conte-rush が `profiles` を複製して正本にしない。

| 項目 | 意味 |
|---|---|
| `id` | `auth.users.id`。利用権行の外部キー |
| `email` | ログインに使ったメール。Account 表示用。権限の唯一の正ではない |

保持:

- セッションは supabase-js の既定 storage（通常は localStorage）に残してよい
- リロード後も session があれば access を再確認してからアプリへ進む
- 制作 Store とは寿命が違う。ログアウト時は制作データを先に破棄する

### internal_users（M11.0・実装済み）

社内無料利用の権限。スキーマは M11.0。行の載せ方は M11.1 の SQL Editor 運用。

| 項目 | 意味 |
|---|---|
| `user_id` | `auth.users.id`。主キー |
| `enabled` | `true` のときだけ内部権限が有効 |
| `created_at` | 追加時刻 |
| `updated_at` | 更新時刻 |

制約:

- email 文字列は持たない。検索は Auth 側の email を使う
- クライアントは自分の行を SELECT できるだけとする
- 追加 / 解除 / `enabled` 変更は service role（SQL Editor。M11.1）または M11.6 の招待 Function だけ
- M11.1 の運用: 本人が Magic Link で一度ログイン → 管理者が email から `id` を引いて登録。UID 手コピーと管理画面はしない。SQL は [supabase-m11-1-internal.sql](supabase-m11-1-internal.sql)
- M11.6 の運用: 本人がコードを入力。hash 照合後に JWT の user_id を登録。コードは一時的な登録手段。権限の正は `internal_users`。メール事前収集は不要。SQL は [supabase-m11-invite.sql](supabase-m11-invite.sql)

### subscriptions（M11.0・実装済み）

有料契約の記録。M11.0 / M11.2 ではクライアントが書かない。M11.3 の webhook が同じ表を更新する。

| 項目 | 意味 |
|---|---|
| `user_id` | `auth.users.id`。主キー（1 ユーザー 1 行） |
| `provider` | `"stripe"` または `"manual_fixture"` |
| `status` | アプリ用 enum（Stripe 生値ではない） |
| `current_period_end` | 現在期間の終了。fixture では未来日時でよい |
| `customer_id` | 外部 customer id（Stripe なら `cus_...`）。fixture は空でよい |
| `subscription_id` | 外部 subscription id（Stripe なら `sub_...`）。fixture は空でよい |
| `price_id` | Stripe Price id（補助。access 判定には使わない。M11.3） |
| `cancel_at_period_end` | 期間末解約フラグ。`true` でも status が `active` なら paid（M11.3） |
| `created_at` | 作成時刻 |
| `updated_at` | 更新時刻 |

`status` の値:

`active` / `trialing` / `past_due` / `canceled` / `unpaid` / `incomplete` / `paused`

M11.0 の paid 条件（導出）:

- `status` が `active` または `trialing`
- `current_period_end` は補助。クライアント時計を権限の正にしない

`past_due` の猶予は M11.4 で決める。M11.0 では paid にしない。

クライアントは自分の行を SELECT できるだけとする。書き込みは service role（fixture SQL または M11.3 webhook）。M11.2 のブラウザは決済成功後もこの表を更新しない。

`subscription_id` / `customer_id` は NULL 以外で unique。後続の Stripe subscription イベントはこれらの ID から `user_id` を辿る。1 ユーザー 1 行。

### stripe_webhook_events（M11.3・実装済み）

Stripe の `event.id`（`evt_...`）の重複配信を捨てる表。ブラウザは読まない。service role のみ。

| 項目 | 意味 |
|---|---|
| `event_id` | Stripe event id。主キー |
| `event_type` | 受信した type |
| `processed_at` | 処理完了時刻 |

payload 全体は置かない。

### internal_invite_codes（M11.6・実装済み）

社内招待コード。平文は保存しない。

| 項目 | 意味 |
|---|---|
| `id` | uuid 主キー |
| `code_hash` | 正規化コードの SHA-256 hex。UNIQUE |
| `enabled` | false で無効 |
| `max_uses` | 初期 20。NULL なら上限なし |
| `use_count` | 成功 redeem 回数。既に internal の冪等成功では増やさない |
| `created_at` / `updated_at` | 時刻 |

ブラウザは読めない。service_role のみ。consume と internal 付与は `apply_internal_invite(p_user_id, p_code_hash)` が 1 トランザクションで行う。execute は service_role のみ。

### internal_invite_attempts（M11.6・実装済み）

失敗回数。コードは持たない。

| 項目 | 意味 |
|---|---|
| `user_id` | `auth.users.id`。主キー |
| `fail_count` | 現在窓の失敗数 |
| `window_started_at` | 15 分窓の開始 |

15 分で 8 回失敗すると 429。

### Payment Link 導線（M11.2・実装済み。M11.3 で webhook 反映）

Stripe Test Mode の Subscription Payment Link。Checkout Session をアプリが作らない。

| 項目 | 意味 |
|---|---|
| `stripePaymentLinkUrl` | 公開してよいベース URL。runtime-config。secret ではない |
| `client_reference_id` | クエリ。値は `session.user.id`（UUID）だけ。M11.3 が `user_id` に使う |
| `prefilled_email` | クエリ。session email の補助。権限の正ではない |
| `checkout=success` | アプリへ戻ったあとの案内用 query。`paid` ではない。M11.3 では確認中表示と再確認に使う |

持たない:

- フロントの Stripe secret / restricted key / webhook secret
- クライアントが書く `customer_id` / `subscription_id` / `status`
- Payment Link の `cancel_url`（仕様上無い。タブを閉じる）

`effectiveAccess` の正は従来どおり Supabase の行から導出する。success query では変えない。

### effectiveAccess（導出・保存しない）

テーブルにも JWT にも正本として持たない。読むたびに導出する。

```
internal_users に行があり enabled === true
  → "internal"
そうでなく subscriptions が paid 条件を満たす
  → "paid"
それ以外
  → "none"
```

両方満たすときは `"internal"`。Account 表示もこの値に従う。

### AccessGateState（M11.0・UI）

Auth Gate の状態機械。利用権の正ではない。

| 値 | 意味 |
|---|---|
| `unconfigured` | runtime-config 未入力。アプリを開かない |
| `loading` | Auth クライアント初期化、既存 session の読み取り |
| `unauthenticated` | session なし。ログイン UI（暫定 Magic Link。D119） |
| `checking_access` | session あり。internal / subscription を取得中 |
| `allowed` | `internal` または `paid`。既存 conte-rush を初期化してよい |
| `denied` | ログイン済みかつ `none`。利用権なし UI |
| `network_error` | Auth または利用権の確認に失敗。未契約とは出さない |

- `allowed` になるまで既存アプリ（PDF 選択 / Panel / Timeline 等）は初期化しない
- `network_error` を `denied` に落とさない
- アプリ本体へ進むのは `allowed` だけ（fail-closed）

### 持たないもの（M11.0）

- `profiles`
- ユーザー行の `access_type` 正本カラム
- クライアント Store に置いた利用権の正
- PDF / Panel Data / Cut / Timeline / Motion / Drawing PNG / Upload 画像 / Rush / MP4 / Timesheet のクラウド保存
- Stripe customer を Auth と混ぜた単一テーブル

---

## 将来構想（未定義・未実装）

以下は製品として想定するデータの境界だけである。スキーマ、型、保存方法はまだ決めない。

```
Storyboard Data
    → Cut Data
        → Timeline
            → Motion
            → Rush
```

| 境界 | 役割の目安 |
|---|---|
| Storyboard Data | 読み込んだ絵コンテ PDF と、そのページ単位の情報 |
| Cut Data | CUT 番号、総尺、所属 Panel（M3 の Cut がその人手入力部分） |
| Timeline | Cut 内で各 Panel をいつ表示するか（M4 で開始フレームまで定義） |
| Motion | Panel 表示中の crop 窓（M6 で from/to まで定義） |
| Rush | Timeline + Motion を時間軸に沿って再生したもの（M5 でブラウザ再生の一時構造。M6 で Renderer。M7 で同じ描画の MP4） |

流れは一方向を想定する。逆方向の編集はまだ定義しない。Storyboard Data はまだ定義しない。

M5 では Rush のブラウザ再生までを定義する。

M5.1 では上記の保存構造を増やさない。テンプレートと Cut 選択は UI 状態に留める。

M5.2 でも保存構造は増やさない。横 Timeline の候補位置は UI 状態に留める。`endFrame` は保存しない。

M5.3 でも保存構造は増やさない。常設選択フレームと履歴は UI 状態に留める。`panel-store.js` へ既存 id の復元 API を足してよいが、Panel のフィールドは増やさない。

M5.4 でも保存構造は増やさない。秒+コマは描画時の表示だけとする。正規値は整数 frame のままとする。タイムシート出力はまだ定義しない。

M6 では Motion を独立構造として足す。Panel / Cut / Timeline の項目は増やさない。1 フレーム描画の入口は Frame Renderer とする。

M7 では MP4 書き出しを定義する。ExportSnapshot / ExportImageCache / ExportJob は実行時のみ。Panel / Cut / Timeline / Motion の項目は増やさない。音声トラックとタイムシートはまだ定義しない。

M8 では Timeline placement に `id` を足し、同一 `panelId` の複数配置を許す。Repeat 設定は保存しない。Motion は panelId のまま。

M9 では Timesheet View Model を導出するだけとする。Panel / Cut / Timeline / Motion の項目は増やさない。話数 / タイトルは PDF セッションの UI 状態とする。

M10 では Panel の `source` に `"drawing"` / `"upload"` を足す。画像バイトは PanelMediaStore。Timeline / Motion / Rush / タイムシートの保存項目は増やさない。Onion（M10.2）は UI 状態だけとする。M10.3で保存構造変更なし。M10.4で永続構造変更なし。InsertionContextはUI状態のみ。

M11.0 では Auth / 利用権だけを Supabase に置く。制作データの保存項目は増やさない。プロジェクト保存とクラウド素材保存はまだ定義しない。
