# ONEFLAT eBay Listing Desk (Phase1-STEP11)

指示書 v1.0 に基づく本格Webアプリ化の実装中。
現時点は **§110の実装順序1番(コンポーネント分割)・2番(Supabase Auth)・3番(products/drafts のDB接続)・4番(スマホCamera + Storage)・5番(Claude APIのBackend接続=商品解析)・6番(eBay Taxonomy APIによるカテゴリー候補)・7番(eBay Taxonomy APIによる動的Item Specifics)・8番(eBay Metadata APIによる動的Condition)・9番(eBay OAuth = ADMINによるeBayアカウント連携)・10番(Business Policies / Inventory Locationの取得・選択)・11番(Inventory Item / Offer作成・実際のeBayへのPublish)** が完了している。

### ⚠️ 今回追加で必要な作業(Supabase側SQL)

1. **Supabase**: `audit_logs` テーブルにINSERTポリシーを追加する必要がある(元々SELECTのみだったため)。SQL Editorで以下を実行してください。

   ```sql
   create policy "audit_logs: same organization insert"
     on audit_logs for insert
     with check (organization_id = current_organization_id());
   ```

   他のテーブル(`listing_drafts`の`price`/`currency`/`quantity`列、`listings`テーブル)は既存の`schema.sql`にすでに含まれているため、追加のマイグレーションは不要です。

本番環境: https://oneflat-ebay-desk.vercel.app (Vercelにデプロイ済み。Supabase Auth・eBay/Anthropicのキーも設定済み)

## セットアップ

```bash
npm install
cp .env.example .env.local   # Supabase未設定でもOK(Authゲートが自動でスキップされる)
npm run dev
```

`http://localhost:3000` にアクセスすると `/dashboard` にリダイレクトされる。Supabase環境変数(`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`)を設定していない間は認証ゲートが自動的に素通りになり、`/dashboard` → `/listings/new` で旧 `ebay-listing-desk.html` と同じ見た目・機能の商品登録フォームがそのまま使える(ローカル開発を止めない設計)。Supabase環境変数を設定すると、未ログイン時は自動的に `/login` にリダイレクトされるようになる。

## 現時点で動くもの

- タイトル・ジャンル選択・カテゴリー候補・Condition・日英bilingual入力(About/Appearance/Condition詳細/Included Items)・Item Specifics(ジャンル固定)・出品前チェックリスト・配色カスタマイズ・HTML説明文プレビュー・「まとめてコピー」——すべて旧HTML相当の見た目/挙動をReactコンポーネントとして再現。
- 日→英翻訳ボタンは `POST /api/ai/translate` を叩く。`ANTHROPIC_API_KEY` を設定していない場合は501エラーを返し、UI側は「手入力をお願いします」と表示する(AIが必須インフラにならない設計、指示書§100)。
- **Supabase Authによるログイン(§7-8)**: `/login` (メール+パスワード、Server Action `signInWithPassword`) → `middleware.ts` がセッションをリフレッシュしつつ未ログインを `/login` にリダイレクト → ログイン後は `(app)` レイアウトのヘッダーに `profiles` テーブルから取得した表示名とRole(ADMIN/LISTER/CREATOR)を表示、ADMINのみ「管理」リンクが出る、ログアウトボタンあり。`/auth/callback` はマジックリンク/OAuth用に用意済み(現状未使用)。
  - Supabase環境変数が未設定の間はこの認証機構全体が自動的にスキップされる(`middleware.ts` と `(app)/layout.tsx` の両方で判定)ため、Supabaseプロジェクトが無い状態でもこれまで通り開発を続けられる。
  - `profiles` テーブルにレコードが無いユーザー(=ADMINがまだ招待していない)は、ログインはできるがヘッダーに「アカウントが未登録です」と表示される(§8のRole管理は未実装、次フェーズ以降で管理画面から招待できるようにする予定)。
- **products / listing_drafts のDB保存(§110 step3)**: `/listings/new` の「保存」ボタンを押すと、`repositories/products.ts` / `repositories/listings.ts` 経由でSupabaseに実際に保存される。
  - 初回保存時にSKU(`OF-YYMMDD-連番`, §14)を自動採番し、`products` と `listing_drafts` を新規作成する。2回目以降は同じレコードをUPDATEする。
  - `version` 列による楽観的排他制御(§81)を実装済み。保存時にversionが一致しない(=他の人が先に更新した)場合はエラーメッセージを表示し、上書きしない(§102の無条件上書き禁止)。
  - Item Specifics(ジャンル固定の項目)は `listing_aspect_values` テーブルに保存される(`source: 'human'` 固定)。
  - チェックリスト・配色テンプレートはまだDB化していない(§110 step未定、クライアント内stateのまま)。
  - `POST /api/ai/translate` 以外は認証必須(未ログインならSave自体がエラーを返す)。
- **写真アップロード(§110 step4)**: `/listings/new` の「0. 商品写真」欄から、スマホ/PCで撮影・選択した写真をSupabase Storage(`product-images`バケット、非公開)にアップロードできる。
  - 先に「保存」を1回押して商品(product)を作成しないと写真は追加できない(`product_images`が`products`に外部キーで紐づくため)。
  - アップロード前にファイル種別(画像のみ)・サイズ(8MB上限)をServer Action側で検証する(§102)。
  - バケットは非公開のため、表示のたびにsigned URL(有効期限1時間)を発行して表示している。
  - 削除ボタンで、Storage本体とDB行(`product_images`)の両方を削除する。
  - `supabase/storage.sql` を**追加で**実行する必要がある(バケット作成 + 組織単位のRLSポリシー)。`schema.sql`実行済みのプロジェクトでもこのファイルは未実行のはずなので、SQL Editorで実行してください。
- **AIによる商品解析(§110 step5, §34-36)**: `/listings/new` の「0.5. AIによる商品解析」から、アップロード済みの商品写真をClaude API(`POST /api/ai/analyze-product`)に送り、ブランド・型番・MPN・商品種別を推定できる。
  - 先に商品を保存し、写真を1枚以上アップロードしておく必要がある(最大6枚まで解析対象)。
  - 各項目は「不明」の場合`null`のまま返す設計(§34: AIに存在しない情報を作らせない)。確信度(confidence)も一緒に表示する。
  - 結果は自動反映せず、フィールドごとに「適用」ボタンを押した分だけフォームに反映される(§102: 無条件の自動上書き禁止)。
  - `ai_runs` / `ai_suggestions` テーブルに解析結果を保存し、同一商品・同一写真構成(input_hash一致)であれば再度Claudeを呼ばずに保存済み結果を再利用する(§85: 再実行防止)。
  - `ANTHROPIC_API_KEY` 未設定時は501を返し、UIは「手入力をお願いします」と案内する(§100)。
  - 画像・メモ中の文言はあくまで解析対象のデータとして扱い、AIへの指示として解釈させない(§104)。
- **eBayカテゴリー候補(§110 step6, §37-38)**: `/listings/new` の「1.5. eBayカテゴリー候補」から、英語キーワード(型番・商品種別など)でeBayの実カテゴリーを検索できる。
  - eBay Taxonomy API(Application Access Token, Client Credentials Grant)を使用。特定の出品者アカウントの連携(§9のOAuth, step9)は不要で、`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`だけで動作する。
  - ブランドが特定できない商品でも、商品種別(AI解析結果の`productType`など)で検索すればカテゴリーを絞り込める。
  - 候補は最大5件、eBayが返す順序をそのまま表示する(§37: 順序を並べ替えない)。
  - 選択した候補は `categoryTreeId` / `categoryId` / `categoryName` として `listing_drafts` に保存される(§117-2: カテゴリーはハードコードせず、必ずeBayの応答に由来する値のみを保存)。
  - 旧来の自由入力欄(カテゴリー名を手打ちする欄)は引き続き残っており、動作確認が取れ次第整理する予定。
  - `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` 未設定時は501を返し、UIは自由入力欄への手入力継続を促す(§100)。
- **動的Item Specifics(§110 step7, §39-42)**: `/listings/new` の「7. 商品仕様(Item Specifics・eBayカテゴリー連動)」から、1.5.で選んだeBayカテゴリーに対応する入力項目をeBay Taxonomy API(`get_item_aspects_for_category`)から取得して表示する。
  - `GENRE_FIELDS`のようなジャンル固定配列は使わず、項目名・必須/推奨・選択候補はすべてeBayのレスポンスに由来する(§117-2)。
  - eBay側で「候補値以外の入力を許さない」項目(SELECTION_ONLY)は、単一選択ならプルダウン、複数選択可(MULTI cardinality)ならチェックボックス一覧にする。それ以外(FREE_TEXT)はテキスト入力とし、候補があれば入力補助として表示する。
  - 必須(REQUIRED)項目は「*必須」、推奨(RECOMMENDED)項目は「(推奨)」と表示するのみで、現時点では未入力でも保存をブロックしない(バリデーションの強制は出品(Publish)実装時, §66-71で行う予定)。
  - 入力値は `listing_aspect_values` に保存される(`source: 'human'` 固定、eBayのaspect定義(required/usage/dataType/cardinality)も一緒に保存)。カテゴリーを選び直すと、別カテゴリーのAspect入力値は引き継がずクリアされる。
  - eBayカテゴリー未選択の間、または`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`未設定時は、この欄は空のまま案内文が表示される。
  - 旧来の「7旧. 商品仕様(ジャンル固定・廃止予定)」セクション(`GENRE_FIELDS`ベース)は、この新しい動的版が本番で問題なく動くことを確認できるまで、引き続き併存させてある(step6のカテゴリー自由入力欄と同じ移行方針)。
- **動的Condition(§110 step8, §43)**: `/listings/new` の「2. eBayの状態(Item Condition・eBayカテゴリー連動)」から、1.5.で選んだeBayカテゴリーで実際に選択可能なCondition一覧をeBay Metadata API(`get_item_condition_policies`)から取得して表示する。
  - 固定6択(New/Used-Excellent等)は使わず、選択肢(conditionId・表示名とも)はすべてeBayのレスポンスに由来する(§117-3/§117-4)。
  - 選択結果は `listing_drafts.condition_id`(eBayのconditionId)・`condition_enum`(eBayのconditionDescription)として保存される。カテゴリーを選び直すと選択済みConditionはクリアされる。
  - キャッシュ用に `ebay_condition_cache` テーブルを追加した。**既存プロジェクトでは `supabase/condition_cache.sql` を別途実行する必要がある**(`storage.sql`と同じ位置づけ)。
  - 旧来の「2旧. eBayの状態(固定6択・廃止予定)」セクションは、タイトル候補生成(`titleSuggestions.ts`)がまだこの固定Conditionに依存しているため、そちらの移行と合わせて削除する予定。それまでは両方とも表示される(どちらを選んでも構わないが、実際にeBayへ出品する際の正本は新しい方)。
  - eBayカテゴリー未選択の間、または`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`未設定時は、この欄は空のまま案内文が表示される。
- **eBay OAuth連携(§110 step9, §9)**: `/settings`(ADMINのみ)から、ONEFLATのeBayアカウントを一度だけ認可(Authorization Code Grant)する。
  - 「eBayアカウントを連携」ボタン → `GET /api/ebay/oauth/start`(CSRF対策のstateをCookieに保存しeBayの認可画面へリダイレクト) → eBayでログイン・許可 → `GET /api/ebay/oauth/callback`(state検証 → codeをUser Access Token/Refresh Tokenに交換 → Identity APIでeBayユーザー名取得 → Refresh Tokenを暗号化して保存)という流れ。
  - 取得したRefresh Tokenは`TOKEN_ENCRYPTION_KEY`(AES-256-GCM)で暗号化した上で`ebay_accounts.refresh_token_encrypted`に保存する(平文では保存しない、§102)。
  - 認可スコープは`sell.inventory` / `sell.account` / `sell.fulfillment` / `sell.finances`(2026-09-25に方針追加済みのもの)をまとめて要求する。
  - 実際にInventory API等でこのRefresh Tokenを使ってUser Access Tokenを取得する処理(`refreshUserAccessToken`)は実装済みだが、呼び出し元(出品処理そのもの)はstep10以降で実装する。
  - `/settings`から連携解除も可能(このアプリ側の記録を消すだけで、eBay側の許可自体は取り消さない旨を画面に案内している)。
  - `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` / `EBAY_REDIRECT_URI` のいずれか未設定の場合は、連携ボタンの代わりに未設定である旨を表示する。
  - `ebay_accounts`テーブルは1組織につき1アカウントを想定し、`organization_id`に一意制約を追加した。**既存プロジェクトでは`supabase/ebay_accounts_unique.sql`を別途実行する必要がある**。
- **Business Policies / Inventory Location(§110 step10)**: `/listings/new` の「9. eBay Business Policies・保管場所」から、配送/支払い/返品ポリシーと発送元(保管場所)を選択できる。
  - eBay Sell Account API(`fulfillment_policy` / `payment_policy` / `return_policy`)・Sell Inventory API(`location`)を、ADMINが連携済みのUser Access Token(§9)で呼び出す。Application Access Tokenでは取得できない出品者本人のデータのため。
  - 選択肢は必ずeBayのレスポンスから作る(§117-4)。ポリシー自体の新規作成はこのアプリからはできない(eBay側の「Business Policies」画面で作成する必要がある)。
  - eBayアカウントが「Business Policies」プログラム(Selling Policy Management)へ未加入の場合、fulfillment/payment/return_policy APIは20403エラーを返す。この場合、ADMINへ「Business Policiesに加入する」ボタンを表示し、`POST /api/ebay/business-policies-opt-in`(`sell/account/v1/program/opt_in`)からその場で加入できるようにしてある。加入後もポリシー自体が0件のままなら、eBay側で個別に作成が必要。
  - Inventory Location一覧取得で、保管場所が0件のアカウントに対してeBay Sandboxが500(errorId 25001)を返す既知の不具合があるため、その場合は0件として扱う(致命的エラーとして表示しない)。
  - Inventory Location(保管場所)はこのアプリからADMINのみ新規登録できる(`POST /api/ebay/inventory-locations`、eBayアカウントへの書き込みを伴うため)。
  - 選択結果は `listing_drafts.fulfillment_policy_id` / `payment_policy_id` / `return_policy_id` / `merchant_location_key` として保存される(これらの列は元々`schema.sql`に用意済みだったため、追加のDBマイグレーションは不要)。
  - eBayアカウント未連携(§9未実施)の場合は、`/settings`で連携するよう案内が表示される。
  - 実際にこれらのID(Policy ID / Location Key)を使ってInventory Item・Offerを作成し出品する処理(Publish本体)はstep11で実装した(下記)。
- **価格・数量入力 + eBayへのPublish(§110 step11, §66-71, §76)**: `/listings/new` に新設した「価格・数量(eBay Offerに必須)」欄で価格・通貨・数量を入力し、一番下の「eBayへ出品する(Publish)」ボタンで実際にeBay Sandbox(または本番)へ出品できる。**2026-09-25、eBay Sandboxで実機Publishが成功したことを確認済み(Listing ID: 110590790136)。本番(Production)環境ではまだテストしていない**(本番へ切り替える場合は、eBay Developer PortalのProduction用キーを取得し、`EBAY_ENV` / `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` / `EBAY_REDIRECT_URI` をVercelで設定し直したうえで、`/settings`から実際のONEFLAT eBayアカウントで再連携する必要がある)。
  - `price` / `currency` / `quantity` を `ListingFormState` / `listing_drafts` に追加した(DB列自体は元々`schema.sql`に用意済みだったため追加マイグレーション不要)。
  - Publishボタンを押すと、まず現在の入力内容を保存(既存の「保存」と同じ処理)→ 必須項目(タイトル・カテゴリー・Condition・配送/支払い/返品ポリシー・保管場所・価格・数量・商品写真1枚以上)のバリデーション → `listing_drafts.status`を`PUBLISHING`へロック(§70: サーバー側で二重出品を防止、同じ下書きへ同時に2回Publishを押しても片方は拒否される)→ eBay Sell Inventory API(`PUT /inventory_item/{sku}` → `POST /offer` → `POST /offer/{offerId}/publish/`)を順に呼ぶ → 成功したら`listings`テーブル(公開後の正本)へ`ebay_listing_id`/`ebay_offer_id`を保存し、`listing_drafts.status`を`PUBLISHED`に変更 → `audit_logs`へ記録、という順序で処理する。
  - 商品写真は、eBayの`imageUrls`に自社アプリの短いリダイレクトURL(`/api/ebay-image/{画像ID}`)を渡し、実際のアクセス時にSupabase Storage(非公開バケット)の署名付きURLへ302リダイレクトする方式にした(`src/app/api/ebay-image/[imageId]/route.ts`)。署名付きURLをそのまま渡すとeBay側のPictureURL文字数制限(1件500文字以内・合計3975文字以内、errorId 25015)を超えてしまうため。eBayのレガシーTrading APIと異なり、Sell Inventory APIは事前にMedia API(EPS)へアップロードしておく必要がないため(`services/ebay/media.ts`のEPSスタブは現状未使用のまま)。
  - 本番URLが `oneflat-ebay-desk.vercel.app` と異なる独自ドメインになった場合は、環境変数 `APP_BASE_URL`(例: `https://your-domain.com`)を設定してください。未設定の場合はVercelが自動で設定する`VERCEL_URL`を使うため、通常は追加設定不要です。
  - eBay Metadata APIの`conditionId`(数値)は、Sell Inventory APIが要求する`ConditionEnum`文字列(例: `USED_EXCELLENT`)へ`src/lib/ebay/conditionEnumMap.ts`の対応表で変換する。未登録のconditionIdの場合はエラーにする(推測変換はしない、§117-4)。
  - Publish失敗時(eBay側のエラー・バリデーション失敗等)は`listing_drafts.status`を`FAILED`に戻し、再度Publishボタンを押せば最初からやり直せる(§71。`createOrReplaceInventoryItem`/`createOffer`は同じ内容なら再実行しても安全な設計)。
  - **2026-09-26修正**: 同一SKUに対して既にOfferが存在する場合(errorId 25002)、以前は既存のOffer IDをそのまま再利用するだけで、前回の失敗/中断時点の古い価格・数量・説明文が残ったままPublishされてしまう不具合があった。現在は既存Offerが見つかった場合、必ず`updateOffer`(`PUT /offer/{offerId}`)で今回入力した最新の価格・数量・ポリシー・説明文へ同期してからPublishする(`src/services/ebay/inventory.ts`)。
  - `audit_logs`テーブルは元々SELECTポリシーしかなかったため、INSERTポリシーを追加した(上記「今回追加で必要な作業」参照)。

- **出品済みListing一覧画面(§110 step12・第一段階)**: `/listings` で、Publish成功済みのListing(タイトル・SKU・価格・数量・ステータス・出品日・eBay商品ページへのリンク)を一覧表示できる。
  - `repositories/listings.ts` の `listPublishedListings()` が、`listings`(公開後の正本)を軸に `listing_drafts`(公開時点のタイトル・価格・数量)を結合して取得する。organization単位の絞り込みは明示的なfilterを書かず、既存のRLSポリシー(「listings: same organization」)に任せている。
  - `services/ebay/auth.ts` に `buildEbayItemUrl()` を追加し、Sandbox/Production環境に応じたeBay商品ページURLを組み立てる。
  - **価格改定(2026-09-26追加)**: ステータスが出品中(ACTIVE)のListingに限り、一覧上で価格を直接編集して「更新」ボタンでeBayへ反映できる(`src/app/(app)/listings/priceActions.ts` の `updateListingPrice`、UIは `src/components/listing/PriceEditCell.tsx`)。eBay Sell Inventory APIの `PUT /offer/{offerId}` は置換動作のため、価格だけでなくカテゴリー・保管場所・各種ポリシー・説明文HTMLも揃えて送る必要があり、これらのいずれかが欠けている場合は安全のため更新自体を中止する(`repositories/listings.ts` の `getListingForOfferUpdate`)。更新成功後は `listing_drafts.price` も新しい値に同期する。
  - **在庫同期(2026-09-26追加)**: 価格改定と同じ形で、出品中(ACTIVE)のListingに限り数量を直接編集して「更新」ボタンでeBayへ反映できる(`src/app/(app)/listings/quantityActions.ts` の `updateListingQuantity`、UIは `src/components/listing/QuantityEditCell.tsx`)。価格改定・在庫同期どちらも同じ事前チェック(カテゴリー・保管場所・各種ポリシー・説明文の有無確認、説明文が無ければeBay側から補う処理)が必要なため、共通処理を `src/app/(app)/listings/offerUpdateHelpers.ts` の `resolveOfferUpdateContext` に切り出した(価格改定側もこちらを使うようリファクタリング済み)。
  - **End Item / 出品終了(2026-09-26追加)**: 出品中(ACTIVE)のListingに限り、「終了する」ボタンでeBay上の出品を取り下げられる(`src/app/(app)/listings/endActions.ts` の `endListing`、eBay呼び出しは `services/ebay/inventory.ts` の `withdrawOffer` = `POST /offer/{offerId}/withdraw`)。旧Trading APIと異なり、このAPIは終了理由(End Reason)の指定が不要。取り消せない操作のため、UI側(`src/components/listing/EndListingButton.tsx`)で「終了する」→「終了する(確定)/キャンセル」の2段階確認を挟む。終了後は`listings.status`が`ENDED`になり(サーバー側でも`status='ACTIVE'`条件付きUPDATEにして二重終了を防止)、以降は編集・終了ボタンとも表示されなくなる。
  - **再出品は未実装**(後続stepで追加する方針)。
  - **2026-09-26追加の修正(1)**: Publish処理はこれまでeBayへ渡すためだけに説明文HTMLをその場で組み立てており、`listing_drafts.description_html`へは保存していなかった。そのため価格改定機能が「説明文が空」と判定して更新を安全側で中止してしまう不具合があった。Publish/再Publishのたびに `listingsRepo.updateDraftDescriptionHtml()` で保存するよう修正(`publishActions.ts`)。
  - **2026-09-26追加の修正(2)**: 「既存下書きを開き直してPublishし直す」導線がまだ未実装のため、修正(1)より前にPublishされたListingは再Publishできず、DB側の説明文を補う手段が無かった。そこで `services/ebay/inventory.ts` に `getOffer`(`GET /offer/{offerId}`)を追加し、DBに説明文が無い場合はeBay側に現在登録されている値をそのまま取得して使うようにした(`priceActions.ts`)。取得できた場合はついでにDBへも保存するため、2回目以降はeBayへの追加リクエストなしで済む。

## まだ実装されていないもの(意図的に未実装)

このスキャフォールドは「型・ディレクトリ構成・サービス層の輪郭」を先に作り、実データ連携は指示書§110の順序どおり後続フェーズで実装する方針です。

- debounceによる自動保存(§80) — 未実装。現状は「保存」ボタンによる手動保存のみ
- 管理画面からのユーザー招待・Role割り当て(§8) — 未実装。`profiles` テーブルへのレコード作成は現状手動(SupabaseダッシュボードでのSQL実行を想定)
- チェックリスト・配色テンプレートのDB保存(§89-90) — 未実装。クライアント内stateのみ(保存ボタンを押しても消える)
- 商品一覧・編集画面(既存下書きを開き直す導線) — 未実装。`loadListingDraft`(サーバーアクション)は用意済みだがUIから未接続
- 写真の並び替え・メイン画像の変更・画像種別(main/label/back等)の指定 — 未実装(常に最初にアップロードした写真がis_primary=trueになるのみ。Publish時は`sort_order`順(is_primary優先)で画像を送る)
- eBay Media API(EPS) — 未実装のまま(step11の設計判断により、Sell Inventory APIには署名付きURLを直接渡しているため現時点では不要)
- 出品済みListingの終了(End Item)・在庫同期・価格改定・再出品 — 未実装(Publish=新規出品のみ。`listings`テーブルへの記録までは実装済み)
- Claude APIによるタイトル生成・Aspect補完・価格/配送提案 — `src/services/ai/*.ts` に同様のスタブ(翻訳・商品解析は実装済み)
- ホーム画面・STEP1〜3ウィザード・商品一覧・管理画面 — 未実装(`/dashboard` はプレースホルダー)
- 現行の `GENRE_FIELDS` / `CATEGORY_PRESETS` は **意図的にまだ削除していない**(§40のREMOVE対象だが、eBay Aspect APIに置き換わるまでの暫定措置)

## ディレクトリ構成

指示書§96の推奨構成に準拠。詳細は `src/` 以下を参照。

## 既存機能分析表

`docs/feature-analysis.md` に、指示書§116で指定された「既存機能→KEEP/MODIFY/REMOVE/NEW」の一覧表を作成済み。実装着手前にまずこれを参照。

## このあと必要になるもの(ユーザー側で用意していただくもの)

以下はこちらでは作成できない、外部アカウント/認証情報です。準備でき次第 `.env.local` に設定してください。

1. **Supabaseプロジェクト** — `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。プロジェクト作成後、`supabase/schema.sql` を実行してテーブルを作成します。
2. **eBay Developer アカウント(Sandboxアプリ)** — `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` / `EBAY_REDIRECT_URI`。まずSandboxで登録し、Productionは§10の方針どおり完全に分離します。
3. **Anthropic APIキー** — `ANTHROPIC_API_KEY`。§4のとおりモデル名は環境変数(`ANTHROPIC_MODEL`)で変更可能にしてあります。
4. **Vercelプロジェクト**(デプロイ先) — 用意でき次第連携します。
5. **トークン暗号化鍵** — `TOKEN_ENCRYPTION_KEY`(§9)。`openssl rand -base64 32` で生成した文字列をそのまま設定します。eBay Refresh Tokenの暗号化に使うため、これが無いと`/settings`のeBayアカウント連携が動きません。
6. **eBay Developer PortalのRuName(redirect URL name)** — `EBAY_REDIRECT_URI`(§9)。アプリの設定画面で作成し、`https://oneflat-ebay-desk.vercel.app/api/ebay/oauth/callback` を紐づけます。
7. PWA用アイコン画像(`public/icons/icon-192.png`, `icon-512.png`) — ロゴが決まり次第追加してください(暫定で未配置)。

## 次に実装するもの(指示書§110の順序)

12番以降は指示書側で次の番号がどの機能か確定次第、順に着手する(Phase2の注文/利益管理機能、または出品済みListingの管理画面などが候補)。

(11番のPublishまで完了。Sandboxでの実機Publish成功は確認済みだが、本番(Production)ではまだ未検証。本番で問題なく動くことを確認できたら、`GENRE_FIELDS` / `CATEGORY_PRESETS` およびジャンル固定UI(`GenreSection` / 旧`SpecificsSection` / 旧`ConditionSection`)を削除するクリーンアップを別途行う)

## 将来の仕入・注文・利益管理機能統合に向けた方針(2026-09-25追加、実装は別途詳細設計を受けてから)

このアプリへ、将来的に仕入・注文・利益管理の機能を統合する計画がある。現時点(eBay Developer Program承認待ち)ではコードの実装はまだ先だが、あとから手戻りが出ないよう以下の2点だけ設計に反映済み。

1. **eBay OAuthのスコープ(§9)**: `src/services/ebay/auth.ts` の `EBAY_OAUTH_SCOPES` に、出品に必要な `sell.inventory` / `sell.account` に加えて、`sell.fulfillment`(注文情報)・`sell.finances`(入出金・手数料)も含めてある。ADMINが最初にeBayアカウントを認可する時点(§110 step9)でこれらのスコープもまとめて許可を得ておき、将来注文・利益管理機能を追加する際にeBay連携をやり直さずに済むようにする狙い。実際に注文同期・利益計算のAPIを呼ぶ実装は、別途渡される設計に基づいて後日行う。
2. **SKU採番の差し替えやすさ**: SKU採番ロジックを `src/lib/sku/skuStrategy.ts` に切り出した(現状の形式 `OF-YYMMDD-連番` は `dateSequenceSkuStrategy` として実装)。将来、仕入・注文管理と整合する別の採番形式に変更する場合は、この1ファイルの `getActiveSkuStrategy()` の返り値を差し替えるだけでよく、`repositories/products.ts` やUIコンポーネントの変更は不要な設計にしてある。また `src/services/ebay/inventory.ts` のInventory API呼び出し(`createOrReplaceInventoryItem` / `createOffer`、現状はまだスタブ)は `assertValidSku()` により、SKUが空の状態では絶対に実行されないようにしてある(出品時は必ずSKUを設定する、という方針をコードレベルで担保)。
