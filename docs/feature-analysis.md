# 既存機能分析表(KEEP / MODIFY / REMOVE / NEW)

対象: `ebay-listing-desk.html`(v17時点) + Chrome拡張機能一式(`ebay-ext/`)

指示書 §116 に基づき、実装開始前にまず作成。

## ebay-listing-desk.html 由来

| 既存機能 | 判定 | 備考 |
|---|---|---|
| レスポンシブ2カラムUI(.layout, .card, .field-grid) | KEEP | CSS変数ごとNext.jsのglobal CSSへ移植。デザインは変えない |
| タイトル入力・80文字カウント | KEEP | ロジックはそのままReact stateへ |
| タイトル候補生成(ヒューリスティック) | MODIFY→将来REMOVE | Phase1では現状維持。§47のPOST /api/ai/generate-titleに置き換わったら削除 |
| Condition選択(固定ラジオ6種) | REMOVE(段階的) | §43でeBay Metadata API(getItemConditionPolicies)から動的取得する方式へ置換。Phase1-STEP1時点ではUI形だけ残し、データソースは後続フェーズで差し替え |
| About/Appearance/Condition詳細/Included Itemsの日英bilingual入力 | KEEP | 資産として最重要。コンポーネント化のみ |
| 日→英翻訳ボタン(window.claude.use('sample')) | REMOVE | Claude Artifact固有API。§46のPOST /api/ai/translateへ置換 |
| 日→英翻訳フォールバック(MyMemory無料API) | REMOVE | §46で明示的に禁止 |
| `GENRE_FIELDS`(ジャンル別Item Specifics固定配列) | REMOVE | §40で完全廃止。eBay Aspect APIからの動的生成に置換(§39-42) |
| `CATEGORY_PRESETS`(ジャンル別カテゴリー候補固定配列) | REMOVE | §37-38のeBay Taxonomy API(getCategorySuggestions)に置換 |
| Item Specifics手動転記UI | REMOVE | 動的Aspectフォーム+AI補完(§39-42)に置換 |
| 説明文HTML生成(About/Appearance/Condition/Included/Specifications/Shipping/Import) | KEEP(構造) / MODIFY(中身) | §49の構造(空欄セクション非表示)に合わせて調整。Specificsは動的Aspect値から生成 |
| 固定Shipping文・固定DDP文 | MODIFY | §50: 配送条件と一致する場合のみ表示。管理画面でテンプレート編集可能に |
| テンプレート配色カスタマイズ(color-border/color-accent, プリセット) | MODIFY | §51: 商品登録画面から外し、管理画面(説明文テンプレート)へ移動。機能自体は削除しない |
| HTML説明文プレビュー(iframe srcdoc) | KEEP | §52: STEP3で展開できる形で維持 |
| 「まとめてコピー」(拡張機能向けクリップボード転送, `[EBAY-DESK-DRAFT]`) | REMOVE(新API安定後) | §71,111: 新eBay API出品が安定するまでは残し、安定後に削除してChrome拡張を正式廃止 |
| 出品前チェックリスト(8項目, localStorage) | MODIFY | §89-90: 商品単位でDBへ保存。inspected_by/inspected_atを追加 |
| 検品済スタンプ表示 | KEEP | 見た目は維持、裏側の保存先をDBに変更 |
| localStorageのみでの状態保存(チェックリスト・配色) | REMOVE(方式として) | §33,80-82: 商品ドラフトはDB自動保存(debounce)+version管理へ。配色等の軽微なUI設定のみlocalStorage継続可 |
| 商品タイトル/カテゴリー等の単一フォーム一括表示 | REMOVE | §30-31: ホーム画面+STEP1/2/3のウィザード形式に変更 |

## Chrome拡張機能(`ebay-ext/`)由来

| 既存機能 | 判定 | 備考 |
|---|---|---|
| クリップボードから下書き読み込み→eBay出品編集ページへのDOM自動入力(popup.js) | REMOVE(新API安定後) | §67-76のeBay Inventory/Offer/Publish APIによるサーバーサイド直接出品に置換。移行期間中は§111に従い併用可 |
| host_permissions(各国ebay.com等へのアクセス) | REMOVE(新API安定後) | 直接API連携になれば不要 |
| manifest.json / 拡張機能としての配布形態 | REMOVE(新API安定後) | Web Appに一本化 |

## 新規追加(NEW)

| 機能 | 該当セクション |
|---|---|
| Supabase Auth ログイン・社員アカウント・Role(ADMIN/LISTER/CREATOR) | §7-8 |
| カメラ撮影/複数画像アップロード(capture="environment") | §32-33 |
| Backend経由のClaude API(商品解析/翻訳/タイトル/説明文/Aspect補完/価格・配送提案) | §34,41,46-47,58,62 |
| eBay Taxonomy API連携(カテゴリー候補) | §37-38 |
| eBay Metadata API連携(Item Specifics Aspect, Condition) | §39-43 |
| eBay OAuth(Authorization Code Grant, Refresh Token暗号化保存) | §9-10 |
| eBay Account/Inventory/Media/Fulfillment/Finances API連携 | §59-70,53 |
| Supabase DB(products/listing_drafts/listings/orders/…) | §12-28 |
| RLS(組織単位のアクセス制御) | §29 |
| ホーム画面(ダッシュボード的サマリー) | §30 |
| 出品ウィザード(STEP1〜3) | §31-52 |
| 出品後編集(Price/Quantity/Title/Description/Pictures/Aspects/Policies/Condition/End) | §75-76 |
| 商品一覧・検索・複製 | §77-79 |
| 自動保存・楽観的排他制御(version) | §80-82 |
| Audit Log | §83 |
| AIコスト管理・再実行防止(input_hash) | §84-86 |
| PWA対応 | §87 |
| 管理画面(社員/eBay接続/Policies/AI設定/テンプレート/同期) | §91-93 |
| 過去販売データ同期・類似商品検索・AI価格提案・AI配送提案(Phase2) | §53-64 |

## 結論

Phase1-STEP1(今回着手分)は「見た目を大きく変えずにNext.jsコンポーネントへ分割」なので、上表のREMOVE対象(GENRE_FIELDS, CATEGORY_PRESETS, 固定Condition, 拡張機能連携等)は**このステップではまだ削除しない**。コンポーネント化した上で、該当フェーズ(§110の7〜10番目)で順次置き換える。
