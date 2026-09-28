-- §10(最新実装指示書)/Phase2 §21-22 追加分: 注文・取引の自動同期(syncOrders/syncFinances)に
-- 必要な一意制約を追加する。schema.sql実行済みのプロジェクトでは、SQL Editorで
-- このファイルを追加実行してください(condition_cache.sql / ebay_accounts_unique.sqlと同じ位置づけ)。

-- order_items: 同じ注文の同じ行(ebay_line_item_id)を再同期しても重複INSERTされないようにする。
create unique index if not exists idx_order_items_order_line
  on order_items (order_id, ebay_line_item_id)
  where ebay_line_item_id is not null;

-- listings.sku から出品を引けるようにする(注文明細とのマッチングで使用)。
create index if not exists idx_listings_sku on listings (sku);

-- sync_jobs: type別に「直近の成功したジョブ」を素早く引けるようにする。
create index if not exists idx_sync_jobs_type_status on sync_jobs (type, status, completed_at desc);

-- RLS: orders/order_items/finance_transactions/sync_jobsは組織を跨いで
-- 参照される列を持たないため(1組織1eBayアカウント運用、ebay_accounts_unique.sql参照)、
-- 現時点ではRoute Handler側でADMIN/LISTER権限チェックのうえservice_role
-- (RLSバイパス)経由でのみ読み書きする方針とする(§29のコメント参照)。
-- 複数組織対応が必要になった時点で、organization_id列の追加とRLSポリシーの
-- 追加をあらためて行う。
