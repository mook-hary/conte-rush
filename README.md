# conte-rush

アニメーション制作で使う絵コンテ PDF を、ブラウザ上で開くためのツールです。

**実装済み（M0）** は、ローカルの PDF を読み込み、ページをめくって表示することです。

**実装済み（M1）** は、表示中のページ上で矩形をドラッグし、コマ候補（Panel）を手動登録することです。

**実装済み（M2）** は、登録した Panel の範囲を PDF から切り出し、一覧にプレビュー表示することです。

**実装済み（M3）** は、人手で Cut を持ち、CUT 番号・総尺・所属 Panel を関連付けることです。

**実装済み（M4）** は、Cut 内の各 Panel に開始フレームを人手で置くことです。

**実装済み（M5）** は、配置完了した Cut を登録順に連結し、24fps の静止画ラッシュとしてブラウザ再生することです。

**実装済み（M5.1）** は、多数の Cut を扱いやすくするための UI / 操作改善です。ページ送り位置、高密度 Cut 一覧、入力クリアを含みます。

**実装済み（M5.2）** は、既存 Cut の編集導線を明確にし、Timeline の `startFrame` を横バーのドラッグで編集することです。

**実装済み（M5.3）** は、常設の選択フレームで Panel を連続取得し、Panel 登録・削除と Timeline の `startFrame` 変更を Undo / Redo できるようにすることです。

**実装済み（M5.4）** は、Timeline 編集 UI と Rush メーターの frame 表示を、秒+コマと総フレームの併記にすることです。保存値は整数 frame のままです。

**実装済み（M6）** は、独立した Motion Data で PAN / TU / TB をブラウザ Rush に乗せることです。

**実装済み（M7）** は、同じ Frame Renderer からブラウザ内で 1280×720 / 24fps / 映像のみの H.264 MP4 を書き出すことです。

**実装済み（M8）** は、同一 Panel の複数 Timeline placement と、Repeat による全置換です。Rush / MP4 は最終 placements だけを見ます。

**実装済み（M9）** は、完成した Timeline と Motion から、JIS B4 縦の印刷用タイムシート PDF を出すことです。

## 現状できること（M0〜M9・実装済み）

- ユーザーの端末上にある PDF を選んで開く
- 1ページ目をブラウザに描画する
- 前ページ / 次ページで移動する
- 現在ページと総ページ数を表示する
- 別の PDF を選び直す
- 表示中ページ上のドラッグで Panel を登録する
- 現在ページの Panel を PDF 上の枠として表示する
- 全 Panel の一覧と削除
- Panel 範囲の確認用サムネイル表示
- 選択した Panel 群から Cut を作る
- CUT 番号と総尺を人手で入力する
- 1つの Cut に複数 Panel を所属させる
- 新規 Cut 作成時、所属 Panel を総尺へ均等配置する（短尺で重なるときは未完成のまま）
- Cut ごとに Timeline を持ち、所属 Panel に開始フレームを置く
- 表示区間を次の開始または総尺から確認する
- 配置完了した Cut を登録順に連結して 24fps で再生する
- Play / Pause / 先頭へ戻る
- ページ送りを PDF 表示枠の直下で行う
- Cut 一覧の高密度 1 行表示と、別ペインでの詳細編集
- CUT番号と尺の個別クリア
- 新規 Cut と既存 Cut 編集を別フォームで区別する
- 横 Timeline で各 placement の `startFrame` をドラッグ編集する
- 所属 Panel（素材）を選んで横 Timeline 上へクリック / ドラッグし、同じ Panel でも新しい placement を追加する
- 選択中マーカーを `← / →`（1f）または `Shift + ← / →`（5f）で微調整する
- Timeline の開始・区間・マーカーを秒+コマと総フレームで併記する
- Repeat（共通 holdFrames、所属順）で Timeline を全置換する。既存があれば確認する
- 同一 Panel の複数マーカーを個別に選択・移動・削除する
- Rush の Local（Cut内）と Global（全体）を秒+コマと frame で確認する
- 画面高さ不足時はページを縦スクロールする。Cut 一覧は一覧内スクロールのまま
- PDF 上の常設選択フレームから「画像取得」する
- 見た目 16:9 の維持を ON/OFF できる
- 自由ドラッグで別サイズの Panel を取る
- Panel 登録・削除と Timeline の `startFrame` 確定を Undo / Redo する
- Cut 詳細で Panel ごとに PAN / TU / TB の Motion を付ける
- START / END の 16:9 枠で始点・終点画角を指定する
- Rush の 16:9 canvas で Motion を再生する
- Motion 作成・削除・画角変更を Undo / Redo する
- Timeline 完成後に 1280×720 / 24fps / H.264 MP4（映像のみ）をブラウザ内で書き出す
- 書き出し中の進捗表示とキャンセル
- 完成 Timeline から B4 縦タイムシート PDF をプレビュー / 保存する
- 話数とタイトルを PDF セッション単位で入力する

## 現状できないこと

次は構想または仕様のみであり、実装していません。

- Panel の自動検出
- CUT 番号の OCR / 自動認識
- 秒+コマ形式による開始フレームの直接入力
- 音声 / BGM / SE
- トランジション
- AI 解析
- カメラワークの自動解析
- ラッシュの自動生成

## プライバシー

PDF はユーザーのローカルファイルから読み込み、ブラウザ内だけで処理します。サーバーや外部サービスへアップロードしません。

PDF.js のライブラリ本体は CDN から取得する想定です。PDF の中身はその通信に含めません。

M7 では Mediabunny 1.51.0 も CDN（jsDelivr）から取得します。M9 では pdf-lib 1.17.1 も同様です。PDF と生成ファイルの中身はその通信に含めません。

## 動作環境

- GitHub Pages で配信できる静的 Web アプリ
- HTML / CSS / JavaScript
- ビルド手順は不要
- PDF.js 4.10.38（CDN）
- MP4 書き出し: WebCodecs が使えるブラウザ。Mediabunny 1.51.0（CDN）
- タイムシート PDF: pdf-lib 1.17.1（CDN）

## 使い方（M0〜M9）

1. このフォルダを HTTP で配信する。例:

   ```bash
   python3 -m http.server 8080
   ```

2. ブラウザで `http://localhost:8080/` を開く
3. 「PDFを選択」からローカルの PDF を選ぶ
4. 「前へ」「次へ」でページを移動する
5. 常設の選択フレームを動かして「画像取得」する。別サイズは「ドラッグ」
6. 右側の一覧で切り出し画像を確認し、誤登録を削除する
7. Panel を選び、CUT 番号と尺（例: `3+12`）を入れて Cut を作成する
8. Cut の「Timeline」で所属 Panel から start を指定して追加する。同じ Panel を何度でも置ける。配置後はドラッグと矢印キーで個別に調整する。開始位置は `1+18（42f）` のように秒+コマと frame で確認する
9. 必要なら hold を入れて「Repeatで置き換え」する。既存 Timeline があるときは確認が出る
10. 配置完了後、「Play」で Rush を再生する
11. Cut 詳細の Motion で PAN / TU / TB を付け、START / END 枠を調整する。同じ Panel の各出現区間で同じ Motion が再生される
12. Undo / Redo で Panel 登録・削除、placement 追加 / 削除 / 移動、Repeat、Motion 変更を戻す
13. Timeline 完成後、「MP4を書き出す」で 1280×720 の映像のみ MP4 を保存する
14. Cut 詳細の「タイムシート」で話数・タイトルを入れ、プレビューまたは B4 PDF を保存する

`index.html` を `file://` で直接開くと、ES モジュールと PDF.js の worker が動かないことがあります。

GitHub Pages で公開する場合は、リポジトリのルートを配信元にしてください。PDF.js と Mediabunny、pdf-lib の取得に CDN（jsDelivr）へ接続できる必要があります。PDF 自体と生成ファイルは Pages へ送られません。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | 現行仕様と非対象 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | 実行時データと、将来のデータ境界 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | マイルストーン |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 設計判断 |

## ライセンス

未定です。
