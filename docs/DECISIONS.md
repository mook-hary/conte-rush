# 設計判断

採用した判断と、採用しなかった案を残す。未決は未決のまま書く。

## D1. GitHub Pages 上の静的 Web アプリにする

- 状態: 採用
- 判断: サーバーを持たず、HTML / CSS / JavaScript の静的配信で動かす
- 理由: 絵コンテ PDF を外部へ置かなくてよい。公開と配布が単純になる
- 採用しなかった案: 独自バックエンド、デスクトップアプリ
- 結果: ビルドツールや API は入れない。エントリは `index.html` とする

## D2. PDF はローカルファイルのみ。外部へ送らない

- 状態: 採用
- 判断: `input type="file"` で選び、ブラウザのメモリ上だけで処理する
- 理由: 絵コンテは未公開の制作物であることが多い
- 採用しなかった案: サーバーへアップロードして変換する、クラウド OCR
- 結果: `fetch` やフォームで PDF を送らない。永続化もしない

## D3. 表示には PDF.js を使う

- 状態: 採用
- 判断: Mozilla PDF.js でページを canvas に描画する
- 理由: ブラウザ内で完結し、GitHub Pages と相性がよい。ページ数とページ描画が取れる
- 採用しなかった案: `iframe` とブラウザ標準ビューアだけに任せる、サーバーサイド レンダラ
- 結果: ライブラリ JS は jsDelivr の `pdfjs-dist@4.10.38` を使う。PDF バイトは CDN へ載せない。ワーカーへの受け渡しは同一ブラウザ内に限る

## D4. M0 はビューアに限定する

- 状態: 採用
- 判断: ファイル選択、読み込み、1ページ目描画、前後移動、ページ番号、再選択、非送信だけを入れる
- 理由: 自動解析を後から足す前提でも、今その土台を作り込むと仕様が混ざる
- 採用しなかった案: ファイルのドラッグ＆ドロップ投入、ズーム、ページサムネイル、カット枠の手置きを M0 に含める
- 結果: M0 では解析・尺・タイムライン・動画のコードも空ファイルも作らない。Panel 操作は M1、切り出しは M2、Cut は M3 で足す

## D5. 実行時データと将来データ境界を分ける

- 状態: 採用
- 判断: M0 は `PdfSession`、M1 は `Panel`、M2 のプレビューはキャッシュ、M3 は `Cut`、M4 は Timeline を現行データとする。M5 で Rush の再生時スナップショットを定義する。MP4 の中身はまだ定義しない
- 理由: 動画出力まで先に決めると、未検証の前提が仕様に混ざる。再生は所属・配置と分けて定義する
- 採用しなかった案: Cut に `placements` や global 区間を埋め込む。永続 Rush Data を足す。最初から MP4 まで定義する
- 結果: Storyboard Data の完全定義はしない。MP4 は必要になったマイルストーンで SPEC と DATA_MODEL を更新する

## D6. UI 言語は日本語にする

- 状態: 採用
- 判断: 画面文言は日本語とする
- 理由: 対象が日本語圏のアニメーション制作である
- 結果: ボタンや案内、エラー表示は日本語で書く

## D7. PDF canvas と Panel 操作レイヤーを分ける

- 状態: 採用（M1）
- 判断: PDF は既存 canvas にだけ描く。Panel の枠とドラッグは canvas の上に重ねた DOM レイヤーで扱う
- 理由: canvas に枠を描くと再描画で消え、Retina の実ピクセルに縛られる。M0 の `pdf-viewer.js` を壊さない
- 採用しなかった案: PDF canvas に矩形を直接描画する
- 結果: `pdf-loader.js` と `pdf-viewer.js` は PDF 専用のままにする。Panel は `panel-store.js` と `panel-overlay.js` で扱う

## D8. Panel 座標はページ表示に対する相対値とする

- 状態: 採用（M1）
- 判断: `x`, `y`, `width`, `height` を 0〜1 で持つ。原点は表示左上
- 理由: ウィンドウサイズや描画倍率が変わっても同じ位置を再現できる
- 採用しなかった案: canvas 実ピクセルで保存する、PDF ユーザー空間（下原点）で保存する
- 結果: ポインタ座標はオーバーレイの表示矩形から相対値へ変換する。枠の配置はパーセント指定を使う。切り出しも同じ相対値を使う

## D9. 手動 Panel と将来の自動 Panel を同じ基本構造にする

- 状態: 採用（M1）
- 判断: M1 から `source` を持たせ、値は `"manual"` のみ使う
- 理由: 後から `"auto"` や `confidence` を足しても、枠の表示と一覧を流用できる
- 採用しなかった案: 手動専用の別型を作り、自動検出時に載せ替える
- 結果: 現行では自動検出も `confidence` 計算も実装しない。`confidence` フィールドも持たない

## D10. Panel 一覧は全件表示し、並びは固定する

- 状態: 採用（M1）
- 判断: 一覧は全 Panel を出す。並びは `pageNumber` 昇順、同一ページ内は登録順
- 理由: 誤登録の確認と削除ができれば足りる。ソートやフィルタの UI は管理画面になる
- 採用しなかった案: 現在ページだけ出す、ユーザーが並びを変える
- 結果: ソート UI とフィルタ UI は入れない。現在ページの行は見た目で区別する。M2 のサムネイルもこの一覧に載せる。M3 の Cut 作成もこの一覧から選択する

## D11. Panel は保存しない

- 状態: 採用（M1）
- 判断: メモリ上のみ。新しい PDF の読み込み成功時に破棄する
- 理由: 目的は操作を成立させることであり、プロジェクト保存ではない
- 採用しなかった案: localStorage、IndexedDB、JSON エクスポート
- 結果: 読み込み失敗で直前 PDF を維持する場合は、Panel も残す。M2 のキャッシュ、M3 の Cut、M4 の Timeline、M5 の Rush 画像キャッシュも同じ寿命にする

## D12. 切り出しは表示用 canvas を使わない

- 状態: 採用（M2）
- 判断: 対象ページを別 canvas に PDF.js で描き、相対座標で切り出す。倍率はウィンドウ非依存の固定値とする
- 理由: 表示 canvas を切ると Retina とウィンドウサイズに依存し、表示していないページが取れない
- 採用しなかった案: 画面上の canvas を CSS 座標で crop する。サムネイルのために表示ページを切り替える
- 結果: `pdf-viewer.js` は表示専用のままにする。切り出しは `panel-image.js` を新設する

## D13. Panel とサムネイルキャッシュを分ける

- 状態: 採用（M2）
- 判断: Panel は座標のままにする。プレビューは `id` をキーにしたメモリキャッシュに置く
- 理由: 画像を Panel に載せると保存・再選択・将来の解析入力と混ざる
- 採用しなかった案: Panel に `image` や `thumbnail` フィールドを足す
- 結果: 切り出しは `panel-image.js`、キャッシュは `thumbnail-cache.js` とする。削除と PDF 再選択成功でキャッシュを捨てる

## D14. M2 のプレビューと将来の解析画像を分けておく

- 状態: 採用（M2）
- 判断: M2 は確認用の低い倍率だけ使う。切り出し関数は `scale` を引数に取る
- 理由: プレビュー用画像を OCR 入力と定義すると、後で解像度を上げるときに作り直すことになる
- 採用しなかった案: M2 で解析用の高解像度を作る。キャッシュ済みサムネイルを将来の OCR 入力とする
- 結果: OCR は M2 に入れない。必要になったら同じ切り出し関数を別倍率で呼ぶ

## D15. Cut は所属まで持ち、時間配置は Timeline に残す

- 状態: 採用（M3。M4 で再確認）
- 判断: Cut は `cutNumber`、`durationFrames`、`panelIds` までとする。各 Panel の開始フレームは持たない
- 理由: 「どのコマがこの CUT か」と「いつ出すか」を混ぜると、所属と配置が二重管理になる
- 採用しなかった案: Cut に `placements` や `startFrame` を入れる。Panel に `cutId` を持たせる
- 結果: 所属は Cut 側の `panelIds` のみ。並べ替え UI は置かない。M5 の再生順はこの登録順を使う。Timeline は `js/timeline-store.js` で持ち、Cut には `placements` を足さない

## D16. 尺の正規値は `durationFrames`、換算は 24fps

- 状態: 採用（M3）
- 判断: 保存は総フレームだけにする。UI の秒+コマは `秒 * 24 + コマ` で換算する
- 理由: コンテの「3+12」表記と整数フレームの両方を、二重の正にしないため
- 採用しなかった案: 秒とコマを両方保存する。再生 fps を設定できるようにする。30fps で換算する
- 結果: 換算定数はここだけを正とする。M5 の再生 fps も同じ定数を使う。再生 fps の設定 UI は置かない。M5.4 の開始位置表示もこの換算だけを使う

## D17. `cutNumber` は入力表記のままの文字列とする

- 状態: 採用（M3）
- 判断: 完全一致で重複を拒む。`"001"` と `"001A"` は別 CUT。正規化しない
- 理由: 現場の番号は数字以外を含む。自動でゼロ埋めや大文字化すると、入力と表示がずれる
- 採用しなかった案: 数値化して並べる。大文字小文字を無視する。OCR で読む
- 結果: OCR は M3 に入れない。重複時は画面で拒否する

## D18. 1 つの Panel は高々 1 つの Cut に属する

- 状態: 採用（M3）
- 判断: 同じ Panel id を複数 Cut に入れない
- 理由: 所属の参照を単純にし、削除時に切れない id を残しにくくする
- 採用しなかった案: 1 Panel を複数 Cut で使い回す
- 結果: 追加時に既所属なら拒否する。Panel 削除時は全 Cut の `panelIds` から外す。Cut 削除では Panel を消さない。M4 では同じ Panel の placement も外す

## D19. Timeline は `{ cutId, placements }` だけとする

- 状態: 採用（M4）
- 判断: Cut 1 件につき Timeline 0 または 1 件。保存するのは `cutId` と `placements[].panelId` / `startFrame` だけとする
- 理由: 開始フレーム以外を先に持つと、再生・切替・カメラと混ざる
- 採用しなかった案: Cut に埋め込む。`endFrame` を保存する。Timeline 独自 id を足す
- 結果: 扱い順は `startFrame` 昇順。画像は持たない。検証と区間導出は `timeline-store.js` にまとめる想定とする

## D20. 表示終了は導出し、`endFrame` は保存しない

- 状態: 採用（M4）
- 判断: i 番目の終了（排他）は次の `startFrame`。最後は `durationFrames`。表示は開始から終了-1
- 理由: 終了を保存すると、総尺変更と次 Panel の開始の両方と矛盾し得る
- 採用しなかった案: `endFrame` を永続化する。隙間を別データとして持つ
- 結果: 確認表示だけ導出する。M4 では再生ヘッドもタイマーも置かない

## D21. 所属 Panel はすべて配置必須とする

- 状態: 採用（M4）
- 判断: 未配置は編集中の一時状態とする。配置完了は、所属全員にちょうど 1 placement、いずれかが `0f`、開始が総尺内で重複なし、のときだけとする
- 理由: 未完成を Rush に渡すと穴が開く。M5 は配置完了だけを対象にできる
- 採用しなかった案: 未配置を完成扱いする。`panelIds` 順で均等割りする
- 結果: Timeline から placement を消しても `panelIds` は残す。Cut にいない Panel は配置できない。M5 は未完成が 1 件でもあれば全体の再生開始を拒否する

## D22. 1 Panel Cut だけ `0f` を自動配置する

- 状態: 採用（M4）
- 判断: 新規作成時に所属が 1 件なら `0f`。既存 Cut を Timeline 編集対象として初めて扱うとき、Timeline 未作成かつ所属 1 件なら同様に `0f`
- 理由: 1 Panel は置く場所が `0f` しか完成形がない。M3 作成済み Cut を新規作成時だけに限ると取り残す
- 採用しなかった案: 新規作成時だけ自動配置する。複数 Panel も均等自動割りする（M5.4 の D62 で新規作成時のみ採用）。既存 Timeline を補完して書き換える
- 結果: M4 では複数 Panel には自動配置しない。既存 Timeline（空を含む）は勝手に書き換えない。1 Panel の未作成 Timeline は初めて扱うときに `0f` とする

## D23. 尺短縮ではみ出す placement がある変更は拒否する

- 状態: 採用（M4）
- 判断: `startFrame >= 新しい durationFrames` となる placement がある総尺短縮は拒否する。placement は消さない
- 理由: 自動削除すると、置いた開始フレームが消える
- 採用しなかった案: はみ出した placement を自動削除する。総尺に合わせて `startFrame` をクランプする
- 結果: 先に `startFrame` を直してから尺を短くする。総尺を長くするのは許可する

## D24. 0f の Panel を外しても自動で詰めない

- 状態: 採用（M4）
- 判断: Cut から Panel を外したらその placement だけ消す。残った Panel を自動で `0f` にはしない
- 理由: 再生開始が意図せず変わる
- 採用しなかった案: 次の Panel を `0f` にずらす。残りの開始を詰める
- 結果: いずれかが `0f` になるまで未完成とする。ユーザーが直す。M5 はその Cut を含む Rush 全体を再生しない

## D25. Rush は再生時スナップショットだけとし、永続化しない

- 状態: 採用（M5）
- 判断: Play 時に Cut + Timeline から一時構造を作る。Panel / Cut / Timeline の保存項目は増やさない
- 理由: global 区間を Cut に書くと、登録順や尺変更と二重管理になる
- 採用しなかった案: Rush Data を永続化する。Cut に `globalStart` を持たせる
- 結果: 再生中はスナップショットだけを読む。モジュールは `js/rush-player.js`

## D26. 未完成 Cut が 1 件でもあれば全体再生を拒否する

- 状態: 採用（M5）
- 判断: 飛ばさない。CUT 番号と不足理由を出す
- 理由: 間の CUT を抜くと、意図しないラッシュになる
- 採用しなかった案: 未完成 Cut だけ飛ばす。未配置のまま再生する
- 結果: 全 Cut が配置完了してから画像準備に進む

## D27. 再生順は Cut の登録順とする

- 状態: 採用（M5）
- 判断: `cutStore.listAll()` の順。CUT 番号では並べない。並べ替え UI は置かない
- 理由: M3 の所属順と同様、自動ソートは入力と表示をずらす
- 採用しなかった案: `cutNumber` の数値順・文字列順
- 結果: 将来の並べ替えは配列順を変える余地だけ残す

## D28. 再生クロックは経過実時間から frame を求める

- 状態: 採用（M5）
- 判断: `requestAnimationFrame` と `performance.now()`。fps は `FRAMES_PER_SECOND`
- 理由: `setInterval(1000/24)` は負荷で遅れる
- 採用しなかった案: 固定間隔のフレームカウンタ。Rush 側に 24 を再定義する。23.976 / 30fps
- 結果: `frame >= totalFrames` で最終フレームを維持して停止する。ループしない

## D29. Rush 画像は再生開始前にすべて用意する

- 状態: 採用（M5）
- 判断: 検証 → スナップショット → ユニーク Panel を 1 件ずつ生成 → すべて成功してから時計開始
- 理由: 再生中に画像が欠けると、本来のラッシュにならない
- 採用しなかった案: 時計を先行させ「生成中」を出す。失敗したコマを飛ばす
- 結果: 準備中は状態表示のみ。1 件でも失敗したら再生しない。失敗した Panel / CUT を出す

## D30. Rush 画像キャッシュは ThumbnailCache と分ける

- 状態: 採用（M5）
- 判断: `js/rush-image-cache.js`。`cropPanelImage` を `RUSH_SCALE = 2` で呼ぶ。PDF canvas は使わない
- 理由: M2 は確認用の低い倍率である。混ぜると寿命と解像度が再生に引きずられる
- 採用しなかった案: ThumbnailCache を流用する。リサイズのたびに作り直す。MP4 素材と定義する
- 結果: 同一 Panel は 1 回。Pause 再開では再生成しない。dirty 時は不足分だけ足す。PDF 成功時は破棄する

## D31. dirty な次回 Play は 0f から再構築する

- 状態: 採用（M5）
- 判断: 停止中の Cut / Timeline / Panel 変更は dirty。次回 Play でスナップショットを作り直し、`currentFrame = 0`
- 理由: 古い frame を新しい尺に載せると、別 Cut の途中に落ちる
- 採用しなかった案: 再生中に live データを読む。編集後も同じ frame から再開する
- 結果: 編集なしの Pause → Play だけ、同じスナップショットとキャッシュでその位置から続ける

## D32. 最終フレームは 1/24 秒出してから止める

- 状態: 採用（M5）
- 判断: 最終表示は `totalFrames - 1`。総時間 `totalFrames / 24` 秒のあと停止し、最終画像を維持する
- 理由: 最終フレーム到達と同時に止めると、最終コマの表示時間が 0 になる
- 採用しなかった案: 自動ループ。最終フレーム到着ですぐ止める
- 結果: 停止中の Play は先が無いので何もしない。先頭へ戻ってから Play する

## D33. M5.1 は保存構造を増やさず UI だけ変える

- 状態: 採用（M5.1・仕様）
- 判断: Panel / Cut / Timeline / Rush の保存項目は増やさない。Rush 再生ロジックも変えない
- 理由: 多数 Cut の操作改善と、再生の正しさを混ぜない
- 採用しなかった案: Cut に完成フラグを持たせる。Panel にテンプレートを埋め込む。Rush を UI 都合で組み直す
- 結果: 変更は表示位置、一覧密度、入力クリア、登録操作に限る

## D34. ページ送りは PDF 表示枠の直下へ移す

- 状態: 採用（M5.1・仕様）
- 判断: `.page-stage` の下、Rush より上に置く。ページ送りロジックは M0 のまま
- 理由: 操作対象のすぐ下に置き、Rush の再生ボタンと混同しない
- 採用しなかった案: Rush の隣へ寄せる。ヘッダーへ残す
- 結果: 見た目の位置だけ変える

## D35. Cut 一覧は高密度 1 行、詳細は別ペイン

- 状態: 採用（M5.1・仕様）
- 判断: 一覧は CUT番号、尺、frames、所属数、完成状態だけ。編集は別ペイン。行展開やモーダルは使わない
- 理由: 約 100 Cut を俯瞰しつつ、1 件の編集欄は広く保つ
- 採用しなかった案: 一覧に大型サムネイルを出す。行を展開して Timeline を入れる
- 結果: 一覧クリックで詳細対象を切り替える。対象 id は UI 状態のみ

## D36. Timeline 完成表示は描画時に `isComplete` から導出する

- 状態: 採用（M5.1・仕様）
- 判断: Cut / Timeline に完成フラグを持たせない。描画のたびに既存 `timelineStore.isComplete(cut)` を使う
- 理由: 保存フラグは所属や尺の変更と二重管理になる
- 採用しなかった案: Cut に `isComplete` を保存する
- 結果: 一覧の ✓ / ! は表示専用

## D37. CUT番号と尺は個別にクリアする

- 状態: 採用（M5.1・仕様）
- 判断: 各入力の隣に `×` を置き、その欄だけ空にする。確認は出さない
- 理由: 片方だけ直したいことが多い。Panel 選択まで消すと作り直しになる
- 採用しなかった案: フォーム全体をリセットする。Cut Data を空文字で上書きする
- 結果: 新規・編集の両方。Cut Data は触らない

## D38. Panel テンプレートは `{ width, height }` の UI 状態だけとする

- 状態: 採用（M5.1・仕様）
- 判断: 相対 0〜1 の幅と高さだけ覚える。Panel Data と `localStorage` には入れない
- 理由: 次の候補サイズに必要なのは大きさだけ。位置は毎回クリックする
- 採用しなかった案: Panel に `template` を足す。位置も含めて覚える。永続化する
- 結果: PDF 再選択成功時は破棄する。失敗維持時は残す。登録成功のたびに更新する

## D39. 自由ドラッグと stamp は明示的なモード切替とする

- 状態: 採用（M5.1・仕様）
- 判断: `drag` / `stamp` を UI で選ぶ。modifier key 前提にしない。最初の 1 件のあと自動では切り替えない
- 理由: 隠れたキー操作は、連続登録と通常ドラッグを取り違えやすい
- 採用しなかった案: Shift+クリックで stamp。最初の成功後に自動で stamp へ移る
- 結果: テンプレートが無いときはドラッグのみ。最初の 1 件は従来どおりドラッグする

## D40. stamp のクリックは位置指定だけ、確定は専用操作とする

- 状態: 採用（M5.1・仕様）
- 判断: PDF 上のクリックは候補の位置指定・移動にだけ使う。候補クリックでは登録しない。確定は「この位置で登録」。破棄は「やめる」と Esc
- 理由: 位置を変えるクリックと登録確定を分ける。誤クリックで Panel が増えない
- 採用しなかった案: クリックした瞬間に登録する。候補矩形のクリックで確定する
- 結果: クリック位置は矩形の中心。ページ端では矩形全体が 0〜1 に収まるようクランプする

## D41. 候補サイズはページに対する % で調整する

- 状態: 採用（M5.1・仕様）
- 判断: 幅・高さを % 表示し、% で変える。相対値 `0.42` は直接入力させない
- 理由: 絵コンテ上の大きさはページ比率として見る方が分かりやすい
- 採用しなかった案: 0〜1 の小数を入力する。確定済み Panel をリサイズする
- 結果: 調整は未確定の候補に限る。確定済み Panel の移動・リサイズは M5.1 では実装しない

## D42. 新規 Cut と既存 Cut 編集は別フォームのままにする

- 状態: 採用（M5.2・仕様）
- 判断: 作成フォームと編集フォームを分け、「新規 Cut」と「CUT nnn を編集中」で示す。1 つのフォームをモード切替しない
- 理由: 同じ入力欄だと、新規登録と上書きを取り違えやすい
- 採用しなかった案: 詳細ペインだけで作成と編集を兼ねる。一覧行のインライン編集
- 結果: 既存の番号・尺は「変更を保存」まで Cut Store を触らない

## D43. 横 Timeline は左カラムに置き、総尺を排他終端とする

- 状態: 採用（M5.2・仕様）
- 判断: ページ送りの下、Rush より上に横バーを置く。全幅は `durationFrames`。右端ラベルは総尺であり有効な `startFrame` ではない
- 理由: 右サイドバーではドラッグしづらい。M4 の区間 `[start, duration)` と同じ比率にする
- 採用しなかった案: バーをサイドバーへ入れる。右端を `durationFrames - 1` に割り当てる
- 結果: `x = startFrame / durationFrames * width`。最後の開始は右端より少し左

## D44. 横位置は整数 frame へスナップし、総尺内にクランプする

- 状態: 採用（M5.2・仕様）
- 判断: `round(x / width * durationFrames)` のあと `0 … durationFrames - 1` にクランプする
- 理由: `startFrame` は整数であり、総尺そのものは開始位置ではない
- 採用しなかった案: 小数の開始。右端を総尺ぴったりに割り当てて `durationFrames` を許す
- 結果: バーの外は `0` または最終有効 frame。総尺 `1f` は常に `0`

## D45. ドラッグ中は Store を書かず、確定時だけ検証する

- 状態: 採用（M5.2・仕様）
- 判断: pointermove は候補位置だけ。pointerup で既存 `validatePlacement` し、成功時だけ `updatePlacement`
- 理由: 移動のたびに dirty と再描画が走ると、再生準備と表示が乱れる
- 採用しなかった案: pointermove ごとに Store を更新する
- 結果: 成功時だけ Rush を dirty にする。再生中の結果は次回 Play から使う

## D46. 同じ startFrame は拒否し、元位置へ戻す

- 状態: 採用（M5.2・仕様）
- 判断: 重複や検証違反では Store を変えず、マーカーと数値欄を保存済み値へ戻す。空き frame へ自動移動しない
- 理由: 近い空きへずらすと、意図しない切替時刻になる
- 採用しなかった案: 最も近い空き frame へ自動配置する
- 結果: エラー理由を Timeline 編集欄へ出す。候補値は入力欄へ残さない

## D47. ドラッグのキャンセルも保存済み値へ戻す

- 状態: 採用（M5.2・仕様）
- 判断: Esc と pointercancel でも、マーカーと数値欄を保存済み `startFrame` へ戻す。Store は触らない
- 理由: ドラッグ中の候補を残すと、数値とバーと Store が三つ巴になる
- 採用しなかった案: キャンセル時に候補 frame を数値欄へ残す
- 結果: 失敗時と同じ復帰。Rush は dirty にしない

## D48. 0f マーカーは動かせるが、自動では詰めない

- 状態: 採用（M5.2・仕様）
- 判断: `0f` もドラッグできる。無くなったら未完成。他 Panel を `0f` にしない
- 理由: M4 の D24 と同じ。再生開始が意図せず変わらないようにする
- 採用しなかった案: `0f` の移動を禁止する。次の Panel を自動で `0f` にする
- 結果: 完成表示は描画時の `isComplete` のまま

## D49. 未配置の初回配置は数値のみとする

- 状態: 採用（M5.2・仕様）。M5.3 の D58 で操作を拡張
- 判断: 未配置はバー外の別リスト。M5.2 の初回は既存の数値「配置」。配置後だけドラッグする
- 理由: バーへドロップすると、仮位置・重複・Timeline 未作成が一度に出る
- 採用しなかった案: 未配置をバーへドラッグして初回配置する（M5.2）
- 結果: 複数 Panel の誰を `0f` にするかは、これまでどおりユーザーが決める。M5.3 では数値配置を残したまま、選択してバーへ置く操作を足す

## D50. 横 Timeline UI は Store を持たないモジュールにする

- 状態: 採用（M5.2・仕様）
- 判断: 新規 `js/timeline-editor.js` は frame ↔ x、描画、pointer、候補だけとする。書き込みは app の callback
- 理由: 座標計算と検証・dirty を混ぜない
- 採用しなかった案: `app.js` にドラッグ座標を全部書く。editor が Timeline Store を直接更新する
- 結果: Panel / Cut / Timeline / Rush の保存構造と、Rush 再生ロジックは変えない

## D51. M5.3 は保存構造を増やさず UI と履歴だけ変える

- 状態: 採用（M5.3・仕様）
- 判断: Panel / Cut / Timeline / Rush の保存項目は増やさない。Rush 再生ロジックも変えない
- 理由: 連続取得と誤操作からの復帰は操作の問題である
- 採用しなかった案: Panel に選択フレームを埋め込む。履歴を localStorage へ残す
- 結果: `selectionFrame` と history はメモリ上の UI 状態とする。`panel-store.js` の復元 API はフィールドを増やさない

## D52. Panel 取得の標準は常設選択フレームとする

- 状態: 採用（M5.3・仕様）
- 判断: PDF 上に常設の選択フレームを 1 つ持ち、「画像取得」で Panel にする。取得後も枠を残す
- 理由: 同サイズのコマを連続で取る作業が、毎回矩形を描くより短い
- 採用しなかった案: stamp 候補を残したまま常設枠を足す。取得のたびに枠を初期化する
- 結果: 初期は中央、幅 45%、見た目 16:9。ページ送りでは位置・サイズを維持する。PDF 再選択成功時だけ初期化する。正本は overlay。app は `getFrame` と初期化・lock・clamp の指示だけを行う

## D53. 16:9 は overlay の CSS ピクセル見た目とする

- 状態: 採用（M5.3・仕様）
- 判断: `(width * clientWidth) / (height * clientHeight) = 16/9` とする
- 理由: 縦長ページでは相対座標の比と見た目の比が一致しない
- 採用しなかった案: `width / height === 16/9` を 16:9 とする
- 結果: lock の再計算は overlay 実寸を使う

## D54. stamp は常設フレームへ統合し、自由ドラッグだけ残す

- 状態: 採用（M5.3・仕様）
- 判断: 「前回サイズで置く」「この位置で登録」「やめる」と stamp 候補は現行 UI から外す。`frame` と `drag` の 2 系統にする
- 理由: 操作 UI を増やさない。stamp の役割は常設枠が担う
- 採用しなかった案: stamp と常設枠を並立させる。drag も廃止する
- 結果: drag は別サイズの例外とする。drag 確定後に常設フレームの位置・サイズを変えない

## D55. 選択フレーム操作は Undo 対象外とする

- 状態: 採用（M5.3・仕様）
- 判断: 移動・リサイズ・aspect lock 変更は履歴に入れない。画像取得の結果だけを対象にする
- 理由: 枠は未確定の UI 位置である。履歴を Panel 変更に限ると単純になる
- 採用しなかった案: 枠の移動も Undo する
- 結果: M5.3 の必須対象は Panel 登録、Panel 削除、Timeline の `startFrame` 確定

## D56. 履歴は command 形式のメモリスタックとする

- 状態: 採用（M5.3・仕様）
- 判断: 新規 `js/history.js` が `push` / `undo` / `redo` / `canUndo` / `canRedo` / `clear` を持つ。Store は所有しない。新操作の push で Redo を破棄する
- 理由: Store 全体のスナップショットより、操作単位の方が小さい
- 採用しなかった案: 毎回全 Store を複製する。履歴をファイルへ残す
- 結果: 入力欄フォーカス中はショートカットを発火しない。PDF 再選択成功時だけ `clear` する

## D57. Panel 復元は同じ id と削除前の関連を戻す

- 状態: 採用（M5.3・仕様）
- 判断: 登録の Redo は同じ Panel id を使う。削除の Undo は Panel Data、挿入位置、Cut 所属と `panelIds` 内位置、Timeline の `startFrame` を戻す
- 理由: 別 id だと Cut / Timeline の参照が切れる。Panel だけ戻すと所属が消える
- 採用しなかった案: Redo で新しい id を発行する。削除 Undo は Panel 本体だけ戻す
- 結果: `panel-store.js` に既存 id 復元 API を足してよい。フィールドは増やさない。サムネは再生成し、Rush は dirty にする

## D58. 未配置は Timeline 上へ直接置け、配置済みは矢印で 1f 動かす

- 状態: 採用（M5.3・追加）
- 判断: 数値「配置」は残す。未配置 Panel を選んで横バーをクリックまたはドラッグした位置へ初回配置する。配置済みマーカーを選んだときだけ `← / →` で 1f、`Shift` 併用で 5f
- 理由: 大まかに置いてから 1f 単位へ寄せる作業が、数値だけより短い
- 採用しなかった案: 未配置のバー DnD だけにする。矢印キーを常に Timeline へ割り当てる
- 結果: 重複 frame と範囲外は拒否して元の値を維持する。空き frame へ自動ではずらさない

## D59. 画面高さ不足はページ縦スクロールで逃がす

- 状態: 採用（M5.3・追加）
- 判断: `html` / `body` を `100vh + overflow: hidden` にしない。コンテンツが画面を超えたらページ全体を縦スクロールする。Cut 一覧だけ従来どおり一覧内スクロールとする
- 理由: M5.3 で Timeline 詳細の情報量が増え、1 画面へ押し込むと下部が到達不能になる
- 採用しなかった案: 左右カラムを viewport 高さに固定し、各カラムを独立スクロールする。内部領域を三重にスクロールする
- 結果: PDF viewer は `min(52vh, 38rem)` に収め、下部の Timeline / Rush / Cut 詳細はページスクロールで到達する

## D60. 秒+コマは表示専用とし、正は整数 frame のままにする

- 状態: 採用（M5.4・仕様）
- 判断: Timeline の開始・区間・マーカーと Rush メーターに、Cut 総尺と同じ秒+コマを併記する。保存と入力の正は整数 frame とする
- 理由: コンテの「1+18」と検証用の `42f` を両方見たい。二重の正にするとタイムシートや再生がずれる
- 採用しなかった案: `startFrame` を秒+コマで保存する。数値入力を秒+コマに切り替える。24 を Timeline 側へ再定義する
- 結果: `duration.js` に `formatFrameTime` / `formatFrameTimeLabel` / `formatFrameRange` を足し、既存 `formatDuration*` へ委譲する。`timeline-store.js` と `rush-player.js` は変えない

## D61. Rush メーターは Local と Global を明示する

- 状態: 採用（M5.4・仕様）
- 判断: 表示だけ秒+コマを足す。`Local` は現在 Cut 内、`Global` はラッシュ全体とし、ラベルを省略しない
- 理由: 両方とも frame 数に見えるため、ラベル無しだと Cut 内と全体を取り違える
- 採用しなかった案: 片側だけ秒+コマにする。ラベルを略す。`rush-player.js` の返す値を秒+コマにする
- 結果: player は整数 `localFrame` / `globalFrame` のまま。整形は `app.js` が表示時に `duration.js` を使う

## D62. Cut 新規作成時は所属順で総尺へ均等配置する

- 状態: 採用（M5.4・追加）
- 判断: 作成成功時に `startFrame(i) = floor(durationFrames * i / panelCount)` で配置する。1 Panel は `0f`。総尺が短く重複するときは置かず未完成とする
- 理由: 複数 Panel を空の Timeline のままにするより、均等な初期配置から直す方が短い
- 採用しなかった案: 既存 Cut への追加でも再均等する。重複開始をずらして無理に置く
- 結果: 保存は `{ panelId, startFrame }` のまま。追加 Panel は未配置。Cut 作成は Undo 対象にしない

## D63. Motion は Panel / Cut / Timeline から独立させる

- 状態: 採用（M6・仕様）
- 判断: `{ cutId, motions: [{ panelId, from, to }] }` を別 Store にする。既存 3 構造のフィールドは増やさない
- 理由: 「いつ始まるか」と「画面をどう動かすか」を混ぜない。削除整合も Timeline と同じパターンにできる
- 採用しなかった案: Panel へ from/to を書く。Cut へ motions を埋め込む。Timeline placement に scale を足す
- 結果: Motion 未設定は正常。全 Panel に作らなくてよい

## D64. 正本は from/to の x/y/scale。type は表示ラベル

- 状態: 採用（M6・仕様）
- 判断: PAN / TU / TB を排他 enum として保存しない。UI プリセットは from/to の初期値を入れるだけ
- 理由: PAN しながら TU を同じレコードで表せる。後から type を足すと組み合わせが壊れる
- 採用しなかった案: `"pan" | "tu" | "tb"` の排他。type と from/to を両方正にする
- 結果: ラベルは位置差と scale 差から導出する

## D65. Motion 時間は Panel 表示区間全体に従属させる

- 状態: 採用（M6・仕様）
- 判断: `startFrame` / `endFrameExclusive` を Motion に保存しない。区間は既存 `deriveRanges`
- 理由: Timeline の `startFrame` 変更で期間が自動追従する。独立時間だと無効化ルールが要る
- 採用しなかった案: Cut ローカルの開始・終了を保存する。部分 Motion を M6 から入れる
- 結果: 部分区間は将来フィールド追加で足せる。M6 では空の時間欄を置かない。配列 `motions` だけ残す

## D66. Motion は出力フレームへの 16:9 crop である

- 状態: 採用（M6・仕様）
- 判断: Panel 画像を平行移動しない。16:9 の crop 窓を画像内で動かす / 拡大縮小する
- 理由: Rush と将来 MP4 が同じ「このフレームでどこを切り出すか」を共有できる
- 採用しなかった案: 画像全体を canvas 上で translate する。letterbox を Motion 中も出す
- 結果: Motion 中は cover。Motionなしだけ contain（M5 の静止に近い）

## D67. x/y は Panel 画像の中心、scale 1 は内接最大 16:9

- 状態: 採用（M6・仕様）
- 判断: 座標は Panel 切り出し画像の 0〜1。PDF の Panel.x / Panel.y とは別。scale >= 1
- 理由: ページ相対と crop 窓を混ぜると PAN の意味が壊れる。scale 1 未満は Panel の外になる
- 採用しなかった案: 左上+幅高さで保存する。scale 1 を「画像全体 fit」にする
- 結果: 16:9 は画素比。PDF 選択フレームの CSS 見た目 16:9（D53）とは定義が違う

## D68. 補間は線形で、最終 frame に to を置く

- 状態: 採用（M6・仕様）
- 判断: `t = (localFrame - start) / (lastFrame - start)` を 0〜1 にクランプ。1 フレームでは式を使わず適用しない
- 理由: START/END 画角は区間の両端 inclusive で見てほしい。排他尺で割ると to に届かない
- 採用しなかった案: ease-in/out。`t = elapsed / duration` のまま
- 結果: M6 にイージング項目は置かない

## D69. rush-player は時刻解決だけ、描画は Frame Renderer

- 状態: 採用（M6・仕様）
- 判断: `globalFrame → Cut → localFrame → panelId` は `resolveFrame` のまま。pose 解決は app。`frame-renderer.js` は `{ canvas, image, pose }` だけ描く
- 理由: MP4 も同じ「frame 解決 → pose 解決 → renderFrame」を回せる。Renderer に Cut 解決を足すと境界が崩れる
- 採用しなかった案: Renderer が `globalFrame` を受け取って `resolveFrame` する。player 内で lerp する。img + CSS transform
- 結果: Play 時に Motion は app が凍結する。player snapshot へ Motion を埋め込まない。`rush-player.js` の時計は変えない

## D70. Motion 編集は Undo / Redo 対象にする

- 状態: 採用（M6・仕様）
- 判断: 作成・削除・from/to 確定を既存 `history.js` に積む。ドラッグ中は Store に書かない
- 理由: START/END を戻したい操作が中心になる。履歴機構は M5.3 で既にある
- 採用しなかった案: Motion Undo を M7 へ送る。Cut 作成まで履歴に入れる
- 結果: Panel 削除 Action は消した Motion も保持して戻す。Cut 作成は対象外のまま

## D71. MP4 は M7。M6 はブラウザ Rush まで

- 状態: 採用（M6・仕様）
- 判断: 旧ロードマップの「M6 = MP4」を繰り下げる。M6 は Motion 再生と共通 Renderer
- 理由: エンコード前に crop の定義と Rush 確認が要る
- 採用しなかった案: M6 で MP4 まで出す。Renderer なしで Rush だけ動かす
- 結果: M6 では空のエンコーダモジュールは作らない。M7 の仕様は SPEC の M7 節

## D72. 1フレームの表示区間には Motion を設定しない

- 状態: 採用（M6・仕様）
- 判断: `startFrame === lastFrame` では作成・編集不可。既存 Motion は消さず、Rush では適用しない
- 理由: 補間の分母が 0 になる。`t = 0` の特例を再生仕様に置きたくない
- 採用しなかった案: 1 フレームで from だけ出す。1 フレームになったら Motion を自動削除する
- 結果: 通常 Motion は先頭で from、末尾で to。最低 2 表示フレーム

## D73. M7 は WebCodecs + Mediabunny。ffmpeg.wasm と mp4-muxer は使わない

- 状態: 採用（M7・実装）
- 判断: 映像フレームのエンコードは WebCodecs（`VideoEncoder`）。MP4 mux は Mediabunny。実装は Mediabunny の `CanvasSource` / `VideoSampleSource` が内部で WebCodecs を呼ぶ形を第一候補とする
- 理由: ブラウザ標準のハードウェアエンコードと、保守されている MP4 書き込みを分けられる。SPS/PPS と `avcC` を自前で持たなくてよい
- 採用しなかった案: deprecated な `mp4-muxer`（作者が Mediabunny へ移行）。ffmpeg.wasm を M7 の第一候補にする（WASM が大きく、起動が重い。GitHub Pages の静的構成と合わない。WebCodecs で足りる処理の重複）
- 結果: 非対応ブラウザは開始前エラー。VP9/WebM への黙ったフォールバックはしない

## D74. M7 出力は 1280×720 / 24fps / AVC / 映像のみ

- 状態: 採用（M7・実装）
- 判断: コンテナ MP4、codec `'avc'`（H.264）。fps は既存 `FRAMES_PER_SECOND`。解像度はオフスクリーン 1280×720 固定。音声なし
- 理由: Rush と同じ 16:9 / 24fps をファイルにする。プレビュー canvas の CSS サイズや dpr を解像度にするとウィンドウと Retina で品質が変わる
- 採用しなかった案: Rush canvas 画素をそのまま使う。1080p 選択 UI。M7 側に 24 を再定義する
- 結果: profile は環境の AVC。希望指定するなら Main 3.1（`avc1.4D401F`）。bitrate UI は置かない

## D75. MP4 の時刻は frame 番号から決める

- 状態: 採用（M7・実装）
- 判断: `timestampUs(n) = round(n * 1_000_000 / FRAMES_PER_SECOND)`。duration は隣 frame との差。`performance.now()` は使わない
- 理由: 24fps の 1 フレームは整数µs に割り切れない。独立に 41667µs を足すと尺がずれる
- 採用しなかった案: rAF 時計。実時間エンコード
- 結果: 完成ファイルの尺は `totalFrames / 24` 秒

## D76. Rush 時計は使わず、Renderer と resolveFrame を共用する

- 状態: 採用（M7・実装）
- 判断: Play/Pause/rAF は使わない。`buildSnapshot` / `resolveFrame` / `renderFrame` / `samplePose` を再利用する。pose ヘルパーのコピーはしない
- 理由: PAN/TU/TB の画素式を二重に持つと Rush と MP4 がずれる。MP4 は決定論的な全 frame 生成である
- 採用しなかった案: exporter 内で crop を再実装する。Rush 再生仕様を M7 用に変える
- 結果: `rush-player.js` の時計は維持。pose 解決は `js/frame-pose.js` の `poseForResolvedFrame` を Rush と MP4 で共用する

## D77. 書き出し画像は Rush キャッシュと分け、Motion 最大 scale で rasterize する

- 状態: 採用（M7・実装）
- 判断: `js/export-image-cache.js`。`cropPanelImage` の pdfScale は `(1280 * motionMaxScale) / baseWidth1`。上限 8。寿命は 1 回の書き出し
- 理由: `RUSH_SCALE = 2` はプレビュー用。TU で scale>1 だと 720p に対してソースが足りない。セッション常駐はメモリが危険
- 採用しなかった案: RushImageCache を MP4 素材にする。全 Panel に作品内最大 TU を一律適用する。書き出し後も PDF セッションへ残す
- 結果: Panel / Cut / Timeline / Motion の保存は変えない

## D78. 書き出し中は PDF 差し替え禁止。キャンセル可。部分ファイルは保存しない

- 状態: 採用（M7・実装）
- 判断: 書き出し中は PDF 選択を無効化。キャンセルは次 frame / 次 Panel 準備の前。encoder / muxer / cache を破棄する
- 理由: 成功した PDF 再選択は `pdfDocument` を破棄する。mux 途中の自動キャンセルより禁止の方が漏れが少ない。長尺では中断手段が要る
- 採用しなかった案: 編集 UI を全面 disable。差し替え時に書き出しを黙って殺す。部分 MP4 を残す
- 結果: 進行中 snapshot へ live 編集は入らない。未完成 Cut は全体拒否（Rush と同じ）

## D79. 完成ファイル名は `<PDF名>-rush.mp4`

- 状態: 採用（M7・実装）
- 判断: 絵コンテ PDF のベース名に `-rush.mp4` を付ける。不明時だけ `conte-rush-YYYYMMDD-HHMM.mp4`
- 理由: 作品の正本が PDF なので、書き出しもそれに紐づける方が自然
- 採用しなかった案: 日時名を第一にする。サーバーアップロード。両方選ぶ UI
- 結果: Blob をブラウザで保存するだけ

## D80. Mediabunny は 1.51.0 を jsDelivr で固定する

- 状態: 採用（M7・実装）
- 判断: PDF.js 4.10.38 と同じく version を URL に書く。候補は `https://cdn.jsdelivr.net/npm/mediabunny@1.51.0/+esm`。`@latest` は使わない。最終 MP4 は当面 `BufferTarget`（メモリ上 Blob）
- 理由: GitHub Pages の静的構成を維持する。最新追従 URL は再現できない
- 採用しなかった案: npm ビルド手順を増やす。未ピン CDN。M7 から File System 直書き
- 結果: `https://cdn.jsdelivr.net/npm/mediabunny@1.51.0/+esm` を動的 import する。長尺のメモリ限界は想定リスク

## D81. timestamp は µs から秒へ換算し、track の frameRate スナップは使わない

- 状態: 採用（M7・実装）
- 判断: Mediabunny 1.51.0 の `CanvasSource.add(timestampSec, durationSec)` に、`timestampUs(n)/1e6` と隣 frame との差を渡す。`addVideoTrack` の `frameRate` はセットしない
- 理由: 1.51.0 の `VideoTrackMetadata.frameRate` は timestamp をスナップする。スナップすると整数µs の差 duration と競合し得る
- 採用しなかった案: `frameRate: 24` でスナップさせる。固定 41667µs を毎回足す
- 結果: エンコードは `QUALITY_HIGH`、keyframe 間隔 2 秒、0 フレームのみ `{ keyFrame: true }`。mux は `Mp4OutputFormat({ fastStart: 'in-memory' })` + `BufferTarget`。`add()` の Promise で backpressure を待つ。キャンセルは `Output.cancel()`

## D82. Timeline placement に id を持たせ、一意性は startFrame とする

- 状態: 採用（M8・実装）
- 判断: `{ id, panelId, startFrame }`。同一 `panelId` を許す。同一 `startFrame` は禁止
- 理由: 横バー・数値行・Undo が panelId で 1 件を特定している。Rush の resolveFrame は startFrame 順だけで足りるが、編集と Motion 区間選択には placement 識別が要る
- 採用しなかった案: `{ panelId, startFrame }` のまま index で識別する。Cut.panelIds に同じ Panel を複数入れる
- 結果: Cut.panelIds は素材。placement が増えても所属配列は一意のまま

## D83. Timeline 完成から「所属全員ちょうど 1 件」を外す

- 状態: 採用（M8・実装）
- 判断: 完成は 1 件以上、0f あり、範囲内、startFrame 重複なし、所属内 panelId。未使用の所属 Panel はヒントのみ
- 理由: Repeat と手動再利用では、所属を素材として残しつつ Timeline では使わないことがある。D20 のちょうど 1 件は複数配置と両立しない
- 採用しなかった案: 所属全員が最低 1 回必須。既存へ Repeat 結果を追記する
- 結果: describeIncomplete の「未配置のPanelがあります」は完成拒否に使わない

## D84. Repeat は確認のうえ全置換する編集コマンドである

- 状態: 採用（M8・実装）
- 判断: 列は当面 `panelIds` 順。共通 holdFrames。総尺まで展開し、連続同一 panelId だけ生成時 collapse。既存 Timeline は確認してから置換。Undo は前後の placements 全体を 1 Action で持つ
- 理由: Repeat 設定を正本にすると手修正と二重管理になる。追記は startFrame 衝突が起きやすい
- 採用しなかった案: Repeat を再生モードとして保存する。回数入力。手動入力直後の collapse
- 結果: Rush / MP4 は最終 placements だけを見る

## D85. 同じ panelId の Motion は各出現の表示区間で sample する

- 状態: 採用（M8・実装）
- 判断: Motion 保存は `cutId + panelId` のまま。`poseForResolvedFrame` は最初の range ではなく、現在 localFrame が入っている range / placementId を使う
- 理由: 0f A と 12f A で同じ PAN を、それぞれの区間の from→to として再生するため。samplePose は再利用できる
- 採用しなかった案: placement 単位 Motion。resolveFrame の時計変更
- 結果: M8 では Motion Data のフィールドを増やさない

## D86. タイムシートは正本にしない一方向出力である

- 状態: 採用（M9・実装）
- 判断: 既存 Cut / Timeline / Motion から Timesheet View Model を作り、プレビューと PDF にだけ使う。Store へ書き戻さない
- 理由: タイムシートを編集可能にすると placements と二重管理になる。M9 の目的は印刷用の紙面を出すこと
- 採用しなかった案: タイムシートを新しい正本にする。CELL を Timeline へ逆変換する
- 結果: `js/timesheet-model.js` は純粋関数。UI 状態の話数 / タイトル以外を保存しない

## D87. JIS B4 縦を pdf-lib 1.17.1 のページサイズで出す

- 状態: 採用（M9・実装）
- 判断: ライブラリは pdf-lib `1.17.1` を jsDelivr の `+esm` で固定する。ページは **257mm × 364mm**（portrait）を pt（`mm * 72 / 25.4`）にした MediaBox。各シートを Canvas に描き PNG で全面へ貼る。左右 72f の 2 面は維持し、縦紙面へ列幅を再フィットする（Canvas 回転はしない）
- 理由: 現場のタイムシートは B4 縦。静的 GitHub Pages で複数ページと実寸が扱える。日本語は canvas のシステムフォントで描き、PDF へ fontkit を足さない
- 採用しなかった案: B4 横、jsPDF、SVG→PDF、背景に実物スキャンを貼る、CDN `@latest`、サーバー変換
- 結果: 印刷は PDF の実寸 100% を前提とする。`page width < page height`。ロゴは描かない

## D88. Panel 番号は Cut.panelIds 順で、丸数字は自前描画する

- 状態: 採用（M9・実装）
- 判断: ①相当は `panelIds` の登場順 1, 2, 3…。同じ panelId は何度出ても同じ番号。円と数字を Canvas で描く。21 以上も同じ（桁が増えたら文字を小さくする）
- 理由: Unicode 丸数字は ⑳ までで、PDF 埋め込みフォントが無いと欠ける。UUID を紙面に出さない
- 採用しなかった案: placement 順番号、`○21` 文字列、Unicode ①〜⑳ の切替
- 結果: CELL は A 列だけ。ACTION は枠のみ空白

## D89. 同一 Panel 連続 placement は View Model 生成時だけ collapse する

- 状態: 採用（M9・実装）
- 判断: `collapseConsecutive` をタイムシート変換でのみ呼ぶ。Timeline Store は触らない
- 理由: M8 の手動連続配置（0f A, 4f A）は Rush では 2 区間だが、紙面では 1 本の継続として読む。Store を畳むと Repeat 後の手修正と衝突する
- 採用しなかった案: 保存時 collapse、Rush 側 collapse
- 結果: A→A→B は CELL で A 継続→B。A→B→A は 3 切替

## D90. CAMERA は各 range に A→線→最終frameの矢印head+B を描く

- 状態: 採用（M9・実装）
- 判断: ラベルは既存 `motionLabel`。1 フレームと `静止` は描かない。同じ panelId の各表示区間に同じ Motion を描く。矢印head は真の `motionLast` にだけ。シート / 左右ブロック境界では線のみ。FIX は縦線で、ページ先頭の継続では `FIX` を再掲する
- 理由: 現場のタイムシートでは矢印headがカメラ完了フレームを示す。ページ境界を Motion 終了と誤認させない
- 採用しなかった案: 分割先の下端ごとに矢印headを付ける。シート2に A を再掲する。type フィールドを足す
- 結果: Motion がページから消えない。終了の誤認を避ける

## D91. 話数とタイトルは PDF セッションの UI 状態とする

- 状態: 採用（M9・実装）
- 判断: Cut にフィールドを足さない。同じ PDF を開いているあいだは Cut 切替でも保持し、読み込み成功時に初期化する
- 理由: 話数 / タイトルは作品共通になりやすい。永続化は M9 の範囲外
- 採用しなかった案: Cut ごとの保存、localStorage
- 結果: 未選択 Cut では入力とボタンを disabled。未完成 Timeline ではプレビュー / 書き出しを拒否する

## D92. Motion に preFIX / postFIX の整数 frame を持たせる

- 状態: 採用（M9・実装）
- 判断: `{ preFixFrames, postFixFrames }` を Motion 要素へ足す。初期 0。未指定は 0。Rush / MP4 / タイムシートは共通の `sampleMotionOnRange`。本体 2 frame 未満は保存拒否。既存レコードは消さない
- 理由: カメラワークの前後に静止を置くのが制作上普通。秒を保存すると frame と二重の正になる
- 採用しなかった案: Motion の絶対 start/end を保存する。Rush と PDF で別計算にする
- 結果: 各 placement range に同じ FIX がかかる。UI は整数入力 + 秒+コマ補助。Undo / Redo 対象

## D93. `source: "manual"` は PDF 切り出しのまま残し、drawing / upload を足す

- 状態: 採用（M10.0・実装済み）
- 判断: 現行 `source` は M1 以来「矩形の作り方」で、値は `"manual"` のみ。将来 `"auto"` は PDF 自動検出用に予約されている。M10 では discriminator を `source` に載せ、`"manual"` = PDF crop、`"drawing"`、`"upload"` とする。`"manual"` を `"pdf"` にリネームしない
- 理由: 永続 JSON は無いが、既存の `add` / `clonePanel` / 履歴スナップショットが `"manual"` を書いている。リネームは差分だけ増える。`"manual"` を手描きの意味に流用すると M1 の意味が壊れる
- 採用しなかった案: `source` を `"pdf"` に改名する。`imageSource` を別フィールドにして `source` は manual/auto のまま（フィールドが増え、両方見る必要がある）。drawing/upload にも `pageNumber=1, x=0…` のダミー矩形を入れる
- 結果: `isPdfPanel(panel)` は `source === "manual" || source === "auto"`。PDF 専用フィールドは pdf Panel だけが持つ

## D94. 画像バイトは Panel レコードに載せない

- 状態: 採用（M10.0・実装済み）
- 判断: D13 を維持する。確定画像は `PanelMediaStore`（キー `panelId`、値は kind + Blob）。Panel は id と source（と pdf なら矩形）だけ
- 理由: 画像を Panel に載せると clone / 履歴 / 将来の保存と混ざる。サムネと Rush キャッシュも今どおり Panel の外
- 採用しなかった案: Panel に `imageBlob` を足す。drawing だけ stroke 配列を Panel に持つ
- 結果: ThumbnailCache / RushImageCache / ExportImageCache は寿命の違うキャッシュのまま。正本 Blob は MediaStore

## D95. 手描きの正本は確定 PNG Blob。編集中だけ stroke

- 状態: 採用（M10.1・実装済み）
- 判断: エディタオープン中は stroke 列で Undo/Redo する。確定時に 1280×720 の PNG Blob を MediaStore へ書く。再編集は確定 PNG を背景に載せ、新しい stroke を重ねる。確定後の一筆履歴は捨ててよい
- 理由: 永続保存が無いので stroke を正本にしても再ロードできない。Rush/MP4 は raster が要る。stroke をセッション中ずっと持つとメモリが増える。簡易ラフ用途なら flatten 再編集で足りる
- 採用しなかった案: stroke を Panel 正本にする。ImageBitmap だけを正本にする（構造化クローンしにくく、履歴に載せにくい）。常時 Canvas を保持する
- 結果: アプリ全体の `history.js` には「Panel 追加」「再編集確定（旧Blob / 新Blob）」「削除」だけを積む。一筆は editor 内部

## D96. Panel 画像の入口は Provider 1 箇所にする

- 状態: 採用（M10.0・実装済み）
- 判断: 新規 `js/panel-image-provider.js`。`resolvePanelImage(panel, options)` が CanvasImageSource を返す。`cropPanelImage` は PDF 専用のまま Provider が呼ぶ。Rush / MP4 / Thumbnail / Motion Editor は `cropPanelImage` を直接増殖させない
- 理由: source 分岐を Rush と Export に書くと M7 の scale 計算が二重になる
- 採用しなかった案: 各キャッシュが source を if する。全 source に同じ固定解像度だけ返す
- 結果: `purpose: "thumbnail" | "rush" | "export" | "motion" | "onion"`。export の pdf だけ `motionMaxScale` で pdfScale を変える。drawing/upload は確定画素を返す（再 crop しない）

## D97. Onion の前後は placement 隣接である

- 状態: 採用（M10.2・実装済み）
- 判断: `placementId` → `deriveRanges` の隣接 range → `panelId` → Provider。透かすのは元 Panel 画像。Motion 適用後の frame は使わない。placement 文脈が無ければ Onion 無効
- 理由: 同じ Panel が Repeat で複数回出る。panelId や Cut.panelIds、PDF ページ順では「今描いている出現の前後」にならない
- 採用しなかった案: Cut.panelIds の前後。PDF ページ順。placement 無しのとき Cut 順でフォールバックする
- 結果: 新規作成直後（未配置）は前後が出ない。曖昧な推定をしない

## D98. PDF 再選択成功は drawing / upload も含め全クリアする

- 状態: 採用（M10.0・実装済み）
- 判断: 既存 `clearSessionData()` と同じ。「新しい PDF = 新しいセッション」。失敗して旧 PDF 維持なら MediaStore も残す
- 理由: プロジェクト保存が無い。PDF 由来と非由来を残すと、どのセッションのラフか分からなくなる
- 採用しなかった案: drawing/upload を PDF 非依存として残す
- 結果: 手描きだけのワークスペースにはしない。作成は PDF セッション中だけ

## D99. Upload 差し替えは M10.1 に含める

- 状態: 採用（M10.1・実装済み）
- 判断: 既存 upload Panel の Blob だけ差し替え、id / 所属 / placement / Motion は維持する。drawing 再編集と同じ invalidate
- 理由: ファイル選択 1 回と MediaStore 更新で足りる。M10.x に送るほど大きくない
- 採用しなかった案: 差し替えを後回しにして、差し替えたいときは削除して再 Upload する
- 結果: 差し替え確定はアプリ history に 1 Action（旧Blob / 新Blob）

## D100. 手描き Editor は専用 overlay とする

- 状態: 採用（M10.1・実装済み）
- 判断: 右カラムに押し込まない。PDF ステージを覆う大きい 16:9 overlay。Pointer Events。PC / ペンタブ優先
- 理由: modal は狭く、ワークスペース切替は PDF セッション状態を隠して復帰が重い
- 採用しなかった案: 右サイドバー内 canvas。別ルートへの画面切替。スマホ最適化
- 結果: Esc / キャンセルで overlay を閉じ、未確定 stroke は捨てる

## D101. 手描きの正本解像度は 1280×720 とする

- 状態: 採用（M10.1・実装済み）
- 判断: 内部 canvas と確定 PNG は 1280×720。表示は CSS で縮小する。`devicePixelRatio` を正本に掛けない
- 理由: M7 の MP4 が 1280×720。表示サイズを正本にするとウィンドウで品質が変わる（D74 と同じ）
- 採用しなかった案: dpr 倍の 2560×1440 を正本にする。表示 CSS ピクセルを正本にする
- 結果: Motion の TU（scale>1）では drawing 画素が足りず拡大になる。M10 では許容し、リスクに書く

## D102. Timeline / Onion の見分けは絵と番号で、対応は placementId で行う

- 状態: 採用（M10.3・実装済み）
- 判断: 追加候補と配置済みに ThumbnailCache のサムネと、タイムシートと同じ `Cut.panelIds` 1-based 番号を出す。UUID は出さない。マーカーと配置済み行の選択、Onion の前後は `placementId`。削除は既存の placement 削除だけ
- 理由: 同じ Panel を複数 placement できる（M8）。panelId で行や前後を結ぶと別出現を誤る。ユーザーは絵と番号で選び、削除したいのは配置であって素材ではない
- 採用しなかった案: UUID を出す。Timeline 専用の別画像取得。一覧［編集］から Cut.panelIds や PDF 順で Onion を推測する。削除で Panel も消す
- 結果: 保存構造は変えない。Onion の解決は M10.2 の `onionNeighbors` のまま

## D103. Timeline ＋からの手描き挿入は candidate frame の左右を Onion にする

- 状態: 採用（M10.4・実装済み）
- 判断: 空白の「＋」から既存 Panel 追加と手描き追加を出す。startFrame は既存 `xToFrame`。前後は `neighborsAroundFrame(startFrame)`。既存編集は `onionNeighbors(placementId)` のまま。手描き確定は Panel / 所属 / placement を 1 Action
- 理由: 「この2枚の間に絵が欲しい」が Onion 機能名を知らなくても通る。placement が無い新規に `onionNeighbors` を流用すると曖昧になる
- 採用しなかった案: ＋を hover 専用にして詳細 UI へ飛ばす。Cut.panelIds で前後を推測する。Panel 追加と placement 追加を別 Undo にする
- 結果: InsertionContext は UI 状態のみ。保存構造は変えない

## 未決

- ライセンス
- GitHub Pages の公開 URL / リポジトリ公開範囲
