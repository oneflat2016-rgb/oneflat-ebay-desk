-- ============================================================
-- §34(最新実装指示書, Phase6): View/Watch分析
-- ============================================================
-- 既存プロジェクトでは、このファイルをSupabaseのSQL Editorで実行してください。
-- eBay Trading API(GetItem)から取得したView数・Watch数を、取得するたびに
-- スナップショットとして追記する(上書きではなく履歴として残す。将来
-- トレンド表示に使えるようにするため)。

create table if not exists traffic_snapshots (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references listings (id) on delete cascade,

  view_item_count integer,
  watch_count integer,

  captured_at timestamptz not null default now()
);

create index if not exists idx_traffic_snapshots_listing
  on traffic_snapshots (listing_id, captured_at desc);

alter table traffic_snapshots enable row level security;

create policy "traffic_snapshots: via listing organization"
  on traffic_snapshots for all
  using (
    exists (
      select 1 from listings l
      join products p on p.id = l.product_id
      where l.id = traffic_snapshots.listing_id
        and p.organization_id = current_organization_id()
    )
  )
  with check (
    exists (
      select 1 from listings l
      join products p on p.id = l.product_id
      where l.id = traffic_snapshots.listing_id
        and p.organization_id = current_organization_id()
    )
  );
