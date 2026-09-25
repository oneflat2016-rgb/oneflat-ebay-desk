# ONEFLAT eBay Listing Desk (Phase1-STEP6)

指示書 v1.0 に基づく本格Webアプリ化の実装中。
現時点は **§110の実装順序1番(コンポーネント分割)・2番(Supabase Auth)・3番(products/drafts のDB接続)・4番(スマホCamera + Storage)・5番(Claude APIのBackend接続=商品解析)・6番(eBay Taxonomy APIによるカテゴリー候補)** が完了している。

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
  - 旧来の自由入力欄(カテゴリー名を手打ちする欄)は引き続き残っており、次のstep7(動的Item Specifics)で置き換え・整理する予定。
  - `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` 未設定時は501を返し、UIは自由入力欄への手入力継続を促す(§100)。

## まだ実装されていないもの(意図的に未実装)

このスキャフォールドは「型・ディレクトリ構成・サービス層の輪郭」を先に作り、実データ連携は指示書§110の順序どおり後続フェーズで実装する方針です。

- debounceによる自動保存(§80) — 未実装。現状は「保存」ボタンによる手動保存のみ
- 管理画面からのユーザー招待・Role割り当て(§8) — 未実装。`profiles` テーブルへのレコード作成は現状手動(SupabaseダッシュボードでのSQL実行を想定)
- チェックリスト・配色テンプレートのDB保存(§89-90) — 未実装。クライアント内stateのみ(保存ボタンを押しても消える)
- 商品一覧・編集画面(既存下書きを開き直す導線) — 未実装。`loadListingDraft`(サーバーアクション)は用意済みだがUIから未接続
- 写真の並び替え・メイン画像の変更・画像種別(main/label/back等)の指定 — 未実装(常に最初にアップロードした写真がis_primary=trueになるのみ)
- eBay Taxonomy/Metadata/Account/Inventory/Media API連携 — `src/services/ebay/*.ts` にシグネチャのみ用意(呼ぶと例外を投げる)
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
5. PWA用アイコン画像(`public/icons/icon-192.png`, `icon-512.png`) — ロゴが決まり次第追加してください(暫定で未配置)。

## 次に実装するもの(指示書§110の順序)

7. 動的Item Specifics(Metadata API) — ここで `GENRE_FIELDS` / `CATEGORY_PRESETS` を削除
8. Condition取得(Metadata API)
9. eBay OAuth
10. Business Policies / Inventory Location

## 将来の仕入・注文・利益管理機能統合に向けた方針(2026-09-25追加、実装は別途詳細設計を受けてから)

このアプリへ、将来的に仕入・注文・利益管理の機能を統合する計画がある。現時点(eBay Developer Program承認待ち)ではコードの実装はまだ先だが、あとから手戻りが出ないよう以下の2点だけ設計に反映済み。

1. **eBay OAuthのスコープ(§9)**: `src/services/ebay/auth.ts` の `EBAY_OAUTH_SCOPES` に、出品に必要な `sell.inventory` / `sell.account` に加えて、`sell.fulfillment`(注文情報)・`sell.finances`(入出金・手数料)も含めてある。ADMINが最初にeBayアカウントを認可する時点(§110 step9)でこれらのスコープもまとめて許可を得ておき、将来注文・利益管理機能を追加する際にeBay連携をやり直さずに済むようにする狙い。実際に注文同期・利益計算のAPIを呼ぶ実装は、別途渡される設計に基づいて後日行う。
2. **SKU採番の差し替えやすさ**: SKU採番ロジックを `src/lib/sku/skuStrategy.ts` に切り出した(現状の形式 `OF-YYMMDD-連番` は `dateSequenceSkuStrategy` として実装)。将来、仕入・注文管理と整合する別の採番形式に変更する場合は、この1ファイルの `getActiveSkuStrategy()` の返り値を差し替えるだけでよく、`repositories/products.ts` やUIコンポーネントの変更は不要な設計にしてある。また `src/services/ebay/inventory.ts` のInventory API呼び出し(`createOrReplaceInventoryItem` / `createOffer`、現状はまだスタブ)は `assertValidSku()` により、SKUが空の状態では絶対に実行されないようにしてある(出品時は必ずSKUを設定する、という方針をコードレベルで担保)。
