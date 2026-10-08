-- ============================================================
-- §33(最新実装指示書, Phase6): 値下げ履歴
-- ============================================================
-- 既存プロジェクトでは、このファイルをSupabaseのSQL Editorで実行してください。
-- 価格改定機能(§110 step12)で価格を変更するたびに1行追加する、
-- 追記専用の履歴テーブル。organization_idは持たず、listings経由で
-- RLSを掛ける(listingsテーブル自体のポリシーと同じ方式)。

create table if not exists listing_price_history (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references listings (id) on delete cascade,

  old_price numeric(10, 2) not null,
  new_price numeric(10, 2) not null,
  currency text not null default 'USD',

  changed_by uuid references profiles (id),

  created_at timestamptz not null default now()
);

create index if not exists idx_listing_price_history_listing
  on listing_price_history (listing_id, created_at desc);

alter table listing_price_history enable row level security;

create policy "listing_price_history: via listing organization"
  on listing_price_history for all
  using (
    exists (
      select 1 from listings l
      join products p on p.id = l.product_id
      where l.id = listing_price_history.listing_id
        and p.organization_id = current_organization_id()
    )
  )
  with check (
    exists (
      select 1 from listings l
      join products p on p.id = l.product_id
      where l.id = listing_price_history.listing_id
        and p.organization_id = current_organization_id()
    )
  );
