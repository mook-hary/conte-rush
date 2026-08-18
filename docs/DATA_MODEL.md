# データモデル

現行の実行時データと、将来構想を混同しない。将来節のエンティティは名前と前後関係だけを示す。フィールド定義も実装もしない。

## 現行

アプリはサーバーを持たない。状態はブラウザのメモリ上にだけ存在する。リロードすると消える。

責務の境界:

- Panel = PDF 上のコンテ画像領域
- Cut = CUT 番号、総尺、所属 Panel
- Timeline = Cut 内で各 Panel をいつ表示するか（開始フレーム）
- Rush = Cut と Timeline を時間軸に沿って再生したもの（M5 で再生時の一時構造を定義）

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

M1 のアプリ実装は、この定義に従う。M2・M3 でもこの項目は増やさない。

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

- M1 の登録値は `"manual"` のみ
- 将来 `"auto"` を足せる余地は残すが、現行では使わない
- `confidence` は項目に含めない

持たないもの:

- `cutId`
- `startFrame` / `endFrame`
- 尺
- 画像データ

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
- PAN / TU / TB
- 画像

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
- 各要素は `panelId` と `startFrame` だけとする
- `panelId` はその Cut の `panelIds` に含まれるものに限る
- 同一 Timeline 内で同じ `panelId` を重ねない
- 同一 Timeline 内で同じ `startFrame` を重ねない
- 所属全員が配置されるまで、一部だけでもよい（未完成）

`startFrame`:

- 0 始まりの整数（フレーム）
- `0 ≤ startFrame < cut.durationFrames`
- 秒+コマでは持たない

表示区間（導出のみ。保存しない）:

- `endFrame` は項目にしない
- `placements` を `startFrame` 昇順に並べる
- i 番目の表示終了（排他）は、次の `startFrame`。最後はその Cut の `durationFrames`
- 表示は `startFrame` から終了-1 までとする
- 例: 84f で 0 / 36 / 60 なら `0–35f`、`36–59f`、`60–83f`

配置完了（Rush に渡せる条件。M4 では再生しない）:

1. `panelIds` のすべてに、ちょうど 1 件の placement がある
2. いずれかが `startFrame === 0`
3. 各 `startFrame` が整数で `0 ≤ startFrame < durationFrames`
4. 同一 Timeline 内で `startFrame` が重ならない
5. 各 `panelId` がその Cut の `panelIds` に含まれる

1 Panel Cut の初期化:

- Cut 新規作成時に所属が 1 件なら、`startFrame: 0` を自動配置する
- 既存 Cut を Timeline 編集対象として初めて扱うとき、Timeline が未作成で所属が 1 件だけなら、同様に `0f` を自動配置する
- 複数 Panel の Cut には自動配置しない
- 既存 Timeline がある場合は書き換えない

持たないもの:

- `endFrame`
- 表示区間の保存
- 切替タイミング
- トランジション
- PAN / TU / TB
- 再生ヘッド、play / pause、実時間タイマー
- 画像

保持と寿命:

- メモリ上のみ。ファイルへ保存しない
- Cut を削除したら、その `cutId` の Timeline も破棄する
- Panel を削除したら、すべての Timeline の placement からその id を除く
- Cut から Panel を外したら、その Panel の placement を除く。`panelIds` からの除外は Cut 側の操作とする
- Cut に Panel を足しても、既存 placement は触らない。足した Panel は未配置とする
- Timeline から placement を消しても、`panelIds` からは外さない
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
| `placements` | `{ panelId, startFrame }`。`startFrame` 昇順 |

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

再生対象:

- すべての Cut が配置完了であること
- 未完成が 1 件でもあればスナップショットを作らず、再生しない

持たないもの:

- ファイルへの保存
- MP4 / 音声
- トランジション
- 再生速度
- Cut への書き戻し

保持と寿命:

- Play 時に構築する。メモリ上のみ
- 再生中は live の Cut / Timeline を読まない
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
- MP4 素材とは定義しない

寿命:

- その Panel を削除したら破棄する
- 新しい PDF の読み込み成功時にすべて破棄する
- 読み込み失敗で直前の PDF を維持する場合は残す
- ファイルへ保存しない

### 持たないもの（現行）

- 永続化した Rush Data
- MP4 / 音声
- 自動検出結果
- `source: "auto"`
- `confidence`
- Panel に埋め込んだ画像、CUT 番号、尺、`cutId`、`startFrame`
- Cut に埋め込んだ `placements` / `startFrame` / global 区間
- Timeline に埋め込んだ `endFrame`
- ユーザー設定の永続化
- Storyboard Data の完全なスキーマ

Panel は後に Storyboard Data へ入り得るが、Storyboard Data 自体は未定義のままとする。

---

## 将来構想（未定義・未実装）

以下は製品として想定するデータの境界だけである。スキーマ、型、保存方法はまだ決めない。

```
Storyboard Data
    → Cut Data
        → Timeline
            → Rush
```

| 境界 | 役割の目安 |
|---|---|
| Storyboard Data | 読み込んだ絵コンテ PDF と、そのページ単位の情報 |
| Cut Data | CUT 番号、総尺、所属 Panel（M3 の Cut がその人手入力部分） |
| Timeline | Cut 内で各 Panel をいつ表示するか（M4 で開始フレームまで定義） |
| Rush | Cut と Timeline を時間軸に沿って再生したもの（M5 でブラウザ再生の一時構造まで定義） |

流れは一方向を想定する。逆方向の編集はまだ定義しない。Storyboard Data と MP4 の中身はまだ定義しない。

M5 では Rush のブラウザ再生までを定義する。MP4 出力はまだ定義しない。
