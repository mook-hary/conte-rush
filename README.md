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

**実装済み（M10.0）** は、Panel 画像取得を共通 Provider に寄せ、drawing / upload を足せる source 形にすることです。

**実装済み（M10.1）** は、手描き Panel とローカル画像 Upload Panel を追加し、PDF Panel と同じ Cut / Timeline / Motion / Rush / MP4 / タイムシート番号へ使えるようにすることです。

**実装済み（M10.2）** は、Timeline placement 文脈の手描き編集中に前後 Panel を半透明参照（Onion Skin）することです。お絵描きソフトにはしません。

**実装済み（M10.3）** は、Timeline の追加候補・配置済み・削除と、Onion Skin の前後が、説明書なしで絵と番号から追えるようにすることです。保存構造は変えません。

**実装済み（M10.4）** は、横 Timeline の「＋」から既存 Panel または手描き Panel を候補 frame へ挿入し、手描きでは左右を Onion Skin として最初から見せることです。保存構造は変えません。

**実装済み（M11.0）** は、Supabase Auth と利用権（internal / paid / none）を制作アプリの外側に置くことです。制作素材のクラウド保存は含みません。

**実装済み（M11.1）** は、社内 5〜6 人を管理画面なしで `internal_users` へ登録する運用です。通常の付与は M11.6 の招待コード。SQL は解除とフォールバックです。

**実装済み（M11.2）** は、当時の denied → Stripe Test Payment Link 導線です。歴史的には COMPLETE。現行の課金経路としては廃止し、M11.4 の Checkout Session に置換済みです。

**実装済み（M11.3）** は、Stripe webhook を Supabase Edge Function で受け、`subscriptions` を更新して `paid` にする処理です。Test Mode。`checkout=success` だけでは利用権は付きません。現行の決済入口は M11.4 です。

**実装済み（M11.6）** は、ログイン済みユーザーが招待コードで自分を `internal_users` に登録することです。GitHub Pages 公開環境で確認済み。社内配布可能な状態です。

**実装済み（M11.4）** は、現行の課金経路です。frontend → `create-checkout-session` → Stripe Checkout Session → webhook → `subscriptions` → access gate。1 user → 1 Customer → 0 または 1 blocking Subscription。Billing Portal で契約管理する。旧 Payment Link は frontend から外し、Stripe Dashboard でも無効化済み。Test Mode 実機確認と post-cleanup 済みです。Gate のブラウザ JS は `js/billing-ui.js` を使い、Edge Function の `_shared` は import しません（GitHub Pages が `_shared` を配信しないため）。

**実装済み（M11.7）** は、特定商取引法に基づく表記、利用規約、プライバシーポリシー、解約案内を静的ページとして置き、Gate / Account から辿れるようにすることです。COMPLETE。ブラウザ実機確認済み。氏名・住所・電話番号は公開 HTML へ直接掲載せず、請求があれば遅滞なく開示します。公開問い合わせ先は設定済みです。税務 / 会計の運用確認済み（法務ページへは書かない。氏名・住所・電話番号・問い合わせメールは README に書きません）。

## 現状できること（M0〜M11.4 / M11.6 / M11.7・実装済み）

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
- 手描き overlay から 1280×720 の Panel を追加・再編集する
- ローカルの PNG / JPEG / WebP を Upload Panel として追加・差し替える
- 再読み込みやタブ discard のあと、同じ端末・同じログインユーザーの直前の制作状態を復元する（端末内 IndexedDB。クラウド保存ではない）
- drawing / upload も Cut / Timeline / Repeat / Motion / Rush / MP4 / タイムシート番号に使う
- Timeline の手描き placement から Drawing Editor を開き、前後 Panel を Onion Skin で参照する
- Timeline の追加候補と配置済みを、サムネイルと Cut.panelIds 順の Panel 番号で見分ける
- 横 Timeline のマーカーと配置済み行を `placementId` で対応付けて選ぶ
- 配置済みの「削除」でその placement だけを消す（素材 Panel は残る）
- Onion Skin で前後の絵のサムネ・番号・有無を確認する。一覧の［編集］では前後を推測しない
- 横 Timeline の空白で「＋」を押し、既存 Panel または手描き Panel をその frame へ挿入する
- ＋から手描きを足すと、左右の絵が Onion Skin として最初から見える
- メールのログインリンクでログインする（暫定 Magic Link。Supabase 設定後）
- 利用権が internal または paid のときだけ本体を操作する
- Account からログアウトすると、ブラウザ内の制作データと端末内ドラフトを破棄する
- 社内利用者は、ログイン後に配布コードで登録できる（M11.6。GitHub Pages 公開環境で確認済み。社内配布可能な状態）。管理者による SQL 付与も残る（管理画面なし）
- 利用権がないときは、月額100円（税込）の Stripe Checkout Session へ進める（Test Mode）。決済後は webhook が利用権を付ける。既存契約があるときは新規契約せず契約管理へ。すぐ反映されないときは「利用権を再確認」する
- ログイン画面、購入前、Account の「解約・表記」から法務ページ（`legal/`）を開ける。ログインは不要

## 現状できないこと

次は構想または仕様のみであり、実装していません。

- Stripe 本番モード切替（M11.8。Live Product / Price / webhook / 実決済。Checkout / Portal への規約 URL もここ。残る正式公開 blocker）
- 社内ユーザー管理画面（M11.1 / M11.6 は SQL と招待コード。UI は作らない）
- Cloudflare Pages 移行（M11.5。公開ブロッカーではない）
- Panel の自動検出
- CUT 番号の OCR / 自動認識
- 秒+コマ形式による開始フレームの直接入力
- 音声 / BGM / SE
- トランジション
- AI 解析
- カメラワークの自動解析
- ラッシュの自動生成
- プロジェクト保存
- 制作データのクラウド保存

## プライバシー

法務ページは [legal/index.html](legal/index.html) です。PDF と Upload 画像はユーザーのローカルファイルから読み込み、ブラウザ内だけで処理します。サーバーや外部サービスへアップロードしません。再読み込みに備えて、制作データの一部を端末内 IndexedDB に置くことがあります。ログアウトまたはブラウザのサイトデータを消すと復元できなくなります。

PDF.js のライブラリ本体は CDN から取得する想定です。PDF の中身はその通信に含めません。

M7 では Mediabunny 1.51.0 も CDN（jsDelivr）から取得します。M9 では pdf-lib 1.17.1 も同様です。PDF と生成ファイルの中身はその通信に含めません。

M11.0 では、ログインと利用権の確認だけ Supabase を使います。PDF / Panel / Drawing / Rush / MP4 / Timesheet は Supabase へ送りません。anon key は公開前提です。service role はブラウザに置きません。

現行の課金経路は M11.4 の Stripe Checkout Session（Edge Function 生成）です。制作ファイルは Stripe へ送りません。Stripe secret はブラウザに置きません。

## 動作環境

- GitHub Pages で配信できる静的 Web アプリ
- HTML / CSS / JavaScript
- ビルド手順は不要
- PDF.js 4.10.38（CDN）
- MP4 書き出し: WebCodecs が使えるブラウザ。Mediabunny 1.51.0（CDN）
- タイムシート PDF: pdf-lib 1.17.1（CDN）
- 現行は GitHub Pages の静的配信。正式有料公開も GitHub Pages のままでよい（M11.5 Cloudflare は公開後の移行候補）
- セットアップ SQL: [docs/supabase-m11.sql](docs/supabase-m11.sql)
- 社内利用権の付与 / 解除: [docs/supabase-m11-1-internal.sql](docs/supabase-m11-1-internal.sql)
- 現行の課金は Edge Function が Checkout Session を作る。Payment Link URL は runtime-config に置かない。Dashboard の旧 Link も無効化済み

## 使い方（M0〜M11.4 / M11.6 / M11.7）

1. このフォルダを HTTP で配信する。例:

   ```bash
   python3 -m http.server 8080
   ```

2. ブラウザで `http://localhost:8080/` を開く
3. `js/runtime-config.js` に Supabase の URL と anon key が入っていれば、メールアドレスへログインリンクを送る。リンクは **送った同じブラウザ** で開く。戻り先は末尾 `/` 付き（GitHub Pages なら `https://mook-hary.github.io/conte-rush/`、ローカルなら `http://localhost:8080/`）。未設定なら「Supabase設定が未完了です」と出る。Dashboard の Redirect URLs にこれらの URL を入れる。PKCE の Magic Link は D125。これは default SMTP では OTP テンプレートを編集できないための暫定措置でもある（D119）
4. 社内利用は、ログイン後に denied 画面の招待コードで登録できる。メールアドレスの事前収集は不要。コードは repo に置かない。権限の正は `internal_users`。管理者は [docs/supabase-m11-invite.sql](docs/supabase-m11-invite.sql) で生成・無効化する。従来どおり [docs/supabase-m11-1-internal.sql](docs/supabase-m11-1-internal.sql) で email から付けることもできる。GitHub Pages 公開環境で新規ユーザー経路まで確認済み
5. 一般利用で利用権が無いときは「月額100円で利用する」の直前で、月額・自動更新・支払時期・提供時期・年間目安・解約条件と、利用規約・プライバシー・特定商取引法・解約についてのリンクを確認できる。Stripe Test Checkout へ進む。決済後は webhook が `paid` を付ける。すでに契約があるときは Checkout せず「契約を管理」へ。すぐ反映されないときは「利用権を再確認」する。社内ユーザーは Stripe 未設定でも本体を使える。Account の「解約・表記」からご利用案内へ進める
6. 利用権がある場合だけ本体が開く。前回の端末内ドラフトがあれば自動で復元する。無ければ「PDFを選択」からローカルの PDF を選ぶ
7. 「前へ」「次へ」でページを移動する
8. 常設の選択フレームを動かして「画像取得」する。別サイズは「ドラッグ」
9. 右側の一覧で切り出し画像を確認し、誤登録を削除する
10. Panel を選び、CUT 番号と尺（例: `3+12`）を入れて Cut を作成する
11. Cut の「Timeline」で追加候補のサムネと番号を見て start を指定して追加する。同じ Panel を何度でも置ける。横 Timeline の空白の「＋」からも、既存 Panel または手描きをその位置へ挿入できる。手描きは左右が Onion として最初から見える。配置済みはサムネ・番号・区間と「削除」で確認する。配置後はドラッグと矢印キーで個別に調整する。開始位置は `1+18（42f）` のように秒+コマと frame で確認する
12. 必要なら hold を入れて「Repeatで置き換え」する。既存 Timeline があるときは確認が出る
13. 配置完了後、「Play」で Rush を再生する
14. Cut 詳細の Motion で PAN / TU / TB を付け、START / END 枠を調整する。同じ Panel の各出現区間で同じ Motion が再生される
15. Undo / Redo で Panel 登録・削除、placement 追加 / 削除 / 移動、Repeat、Motion 変更を戻す
16. Timeline 完成後、「MP4を書き出す」で 1280×720 の映像のみ MP4 を保存する
17. Cut 詳細の「タイムシート」で話数・タイトルを入れ、プレビューまたは B4 PDF を保存する

`index.html` を `file://` で直接開くと、ES モジュールと PDF.js の worker が動かないことがあります。

GitHub Pages で公開する場合は、リポジトリのルートを配信元にしてください。PDF.js と Mediabunny、pdf-lib の取得に CDN（jsDelivr）へ接続できる必要があります。PDF 自体と生成ファイルは Pages へ送られません。

### Stripe Test Mode（M11.4）

secret key はブラウザに置きません。Checkout Session は Edge Function が作ります。

1. [Stripe Dashboard](https://dashboard.stripe.com) で **Test mode** をオンにする
2. Product `conte-rush` の月額 JPY 100 Price を使う（既存 Subscription が付いている Price）
3. Function secret に `STRIPE_SECRET_KEY` と `STRIPE_PRICE_ID` を入れる。値は Dashboard の当該 Price と一致させる
4. Customer Portal を有効化する（支払方法更新と期間末キャンセル。プラン／数量変更はオフ）
5. テストカード `4242 4242 4242 4242` で払う。戻った直後は webhook 待ちで denied のことがある。「利用権を再確認」で `paid` になれば本体を開ける

共有 Payment Link は使わない。frontend から外し、Stripe Dashboard でも無効化済み。本番モードは M11.8。法務表示は M11.7。

Test Mode で実機確認済み: 既存契約は Checkout せず、新規は Checkout → webhook → `paid`、再操作は既存契約検出。Portal からアプリへ戻れる。post-cleanup 済み（orphan Test Customer を削除し、DB 参照は残っていない）。

### Stripe webhook（M11.3 / M11.4）

secret は Supabase Edge Function にだけ置く。`js/runtime-config.js` には置かない。セットアップ SQL は [docs/supabase-m11-3.sql](docs/supabase-m11-3.sql)。

実機確認済み（Test Mode）: Checkout Session 決済 → webhook が `subscriptions` を更新 → `paid` で本体へ入れる。reload 後も、`checkout` query の無い通常 URL でも維持する。`checkout=success` だけでは paid にしない。当時 M11.3 の入口は Payment Link だった。現行の入口は M11.4 の Checkout Session である。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | 現行仕様と非対象 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | 実行時データと、将来のデータ境界 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | マイルストーン |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 設計判断 |
| [docs/supabase-m11.sql](docs/supabase-m11.sql) | M11.0 の Access DB / RLS（M11.3 列を含む） |
| [docs/supabase-m11-1-internal.sql](docs/supabase-m11-1-internal.sql) | 社内利用権の付与 / 解除（SQL Editor） |
| [docs/supabase-m11-3.sql](docs/supabase-m11-3.sql) | 既存プロジェクト向け M11.3 ALTER |
| [docs/supabase-m11-invite.sql](docs/supabase-m11-invite.sql) | M11.6 招待コード表 / 生成 / 無効化（SQL Editor） |
| [legal/index.html](legal/index.html) | M11.7 ご利用案内（特商法 / 規約 / プライバシー / 解約） |

## ライセンス

未定です。
