-- ============================================================
-- §21-22(最新実装指示書, Phase5): 配送提案(Shipping Recommendation Engine)
-- ============================================================
-- 既存プロジェクトでは、このファイルをSupabaseのSQL Editorで実行してください。
-- products.weight_g / width_mm / height_mm / depth_mm は元々schema.sqlに
-- 用意済み(§22のDB列自体はすでに存在していた)ため、ここでは追加しない。

-- listing_drafts: 配送先想定・選択した配送方法・料金取得日時
alter table listing_drafts add column if not exists destination_country text default 'US';
alter table listing_drafts add column if not exists selected_shipping_method text;
alter table listing_drafts add column if not exists shipping_rate_checked_at timestamptz;

-- ============================================================
-- 配送料金表(§21-3の優先順位2番目「管理者が登録した最新料金表」)。
-- Claudeが送料を推測するのではなく、ここに登録された実データを根拠にする(§21-5)。
-- 初期値はあくまで目安として1組織1セットずつ投入するので、実際の契約条件に
-- 合わせてADMINがSQL Editorから更新してください。
-- ============================================================
create table if not exists shipping_rate_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,

  carrier text not null,
  service_name text not null,
  destination_country text not null, -- 'US' 等。'ALL'は全配送先向けの目安として使う

  min_weight_g integer not null,
  max_weight_g integer not null,

  base_cost_jpy numeric(10, 2) not null,
  cost_per_kg_jpy numeric(10, 2) not null default 0,

  delivery_min_days integer not null,
  delivery_max_days integer not null,

  tracking_available boolean not null default true,
  insurance_available boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_shipping_rate_rules_org_dest
  on shipping_rate_rules (organization_id, destination_country);

alter table shipping_rate_rules enable row level security;

create policy "shipping_rate_rules: same organization"
  on shipping_rate_rules for all
  using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

-- 初期値(目安・参考値)。既存の全組織へ1セットずつ投入する。
-- 実際の配送業者との契約料金が分かり次第、ADMINが書き換えてください。
insert into shipping_rate_rules (
  organization_id, carrier, service_name, destination_country,
  min_weight_g, max_weight_g, base_cost_jpy, cost_per_kg_jpy,
  delivery_min_days, delivery_max_days, tracking_available, insurance_available
)
select o.id, v.carrier, v.service_name, v.destination_country,
       v.min_weight_g, v.max_weight_g, v.base_cost_jpy, v.cost_per_kg_jpy,
       v.delivery_min_days, v.delivery_max_days, v.tracking_available, v.insurance_available
from organizations o
cross join (
  values
    ('FedEx', 'FedEx International Priority', 'ALL', 0, 20000, 4500, 1800, 2, 5, true, true),
    ('Japan Post', 'EMS', 'ALL', 0, 30000, 3200, 1400, 4, 10, true, true),
    ('Japan Post', 'Economy Air (SAL/Surface相当)', 'ALL', 0, 20000, 1800, 900, 7, 20, false, false)
) as v(carrier, service_name, destination_country, min_weight_g, max_weight_g,
       base_cost_jpy, cost_per_kg_jpy, delivery_min_days, delivery_max_days,
       tracking_available, insurance_available)
where not exists (
  select 1 from shipping_rate_rules r
  where r.organization_id = o.id
);
