# ONEFLAT eBay Listing Desk (Phase1-STEP3)

指示書 v1.0 に基づく本格Webアプリ化の実装中。
現時点は **§110の実装順序1番(コンポーネント分割)・2番(Supabase Auth)・3番(products/drafts のDB接続)** が完了している。

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
  - 画像・チェックリスト・配色テンプレートはまだDB化していない(チェックリスト/配色は§110 step4、画像はstep5で対応予定)。
  - `POST /api/ai/translate` 以外は認証必須(未ログインならSave自体がエラーを返す)。

## まだ実装されていないもの(意図的に未実装)

このスキャフォールドは「型・ディレクトリ構成・サービス層の輪郭」を先に作り、実データ連携は指示書§110の順序どおり後続フェーズで実装する方針です。

- debounceによる自動保存(§80) — 未実装。現状は「保存」ボタンによる手動保存のみ
- 管理画面からのユーザー招待・Role割り当て(§8) — 未実装。`profiles` テーブルへのレコード作成は現状手動(SupabaseダッシュボードでのSQL実行を想定)
- チェックリスト・配色テンプレートのDB保存(§89-90) — 未実装。クライアント内stateのみ(保存ボタンを押しても消える)
- 商品一覧・編集画面(既存下書きを開き直す導線) — 未実装。`loadListingDraft`(サーバーアクション)は用意済みだがUIから未接続
- カメラ撮影・画像アップロード・Supabase Storage — 未実装
- eBay Taxonomy/Metadata/Account/Inventory/Media API連携 — `src/services/ebay/*.ts` にシグネチャのみ用意(呼ぶと例外を投げる)
- Claude APIによる商品解析・タイトル生成・Aspect補完・価格/配送提案 — `src/services/ai/*.ts` に同様のスタブ(翻訳のみ実装済み)
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

4. スマホCamera + Storage(images未対応。product_imagesテーブルは作成済み)
5. Claude APIのBackend接続(商品解析)
6. Taxonomy API(カテゴリー候補)
7. 動的Item Specifics(Metadata API) — ここで `GENRE_FIELDS` / `CATEGORY_PRESETS` を削除
8. Condition取得(Metadata API)
9. eBay OAuth
10. Business Policies / Inventory Location
