-- ONEFLAT eBay Listing Desk - Supabase schema (Phase1 draft)
-- 指示書 §12-29 に対応。§29: RLSを必ず使用し、社員は自分のorganizationの
-- データしか見られないようにする。ブラウザからservice_roleは絶対使わない。

create extension if not exists "pgcrypto";

-- ============================================================
-- §12 organizations
-- ============================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- §12 profiles (Supabase Auth ユーザーと1:1)
-- ============================================================
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,

  display_name text not null,
  email text not null,

  role text not null check (role in ('ADMIN', 'LISTER', 'CREATOR')),
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_organization on profiles (organization_id);

-- ============================================================
-- §13 ebay_accounts
-- ============================================================
create table if not exists ebay_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,

  marketplace_id text not null default 'EBAY_US',

  ebay_user_id text,
  refresh_token_encrypted text, -- §9: 暗号化必須。DB上は暗号文のみ保持
  token_scope text,

  connection_status text not null default 'DISCONNECTED'
    check (connection_status in ('DISCONNECTED', 'CONNECTED', 'ERROR')),
  last_verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §110 step9: 1組織につき連携できるeBayアカウントは1つとする(Phase1の運用方針)。
-- upsertEbayAccountConnection()のonConflictがこの一意制約に依存する。
create unique index if not exists idx_ebay_accounts_organization on ebay_accounts (organization_id);

-- ============================================================
-- §14 products
-- ============================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,

  sku text not null, -- 例: OF-260924-0001

  brand text,
  model text,
  mpn text,

  product_name_ja text,
  product_name_en text,

  condition_notes_ja text,
  condition_notes_en text,

  about_ja text,
  about_en text,

  appearance_ja text,
  appearance_en text,

  included_items_ja text,
  included_items_en text,

  cost_price numeric(12, 2),
  cost_currency text default 'JPY',

  weight_g integer,
  width_mm integer,
  height_mm integer,
  depth_mm integer,

  storage_location text,

  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create unique index if not exists idx_products_org_sku on products (organization_id, sku);

-- ============================================================
-- §15 product_images
-- ============================================================
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,

  original_path text not null,
  optimized_path text,
  ebay_image_url text,

  sort_order integer not null default 0,
  is_primary boolean not null default false,

  image_type text not null default 'other'
    check (image_type in ('main', 'label', 'back', 'accessories', 'damage', 'other')),

  uploaded_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product on product_images (product_id);

-- ============================================================
-- §16 listing_drafts
-- ============================================================
create table if not exists listing_drafts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,

  marketplace_id text not null default 'EBAY_US',

  category_tree_id text,
  category_id text,
  category_name text,

  condition_id text,
  condition_enum text,

  title text,
  description_html text,

  price numeric(12, 2),
  currency text default 'USD',
  quantity integer not null default 1,

  merchant_location_key text,

  payment_policy_id text,
  fulfillment_policy_id text,
  return_policy_id text,

  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED')),

  created_by uuid not null references profiles (id),
  updated_by uuid references profiles (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 -- §81 楽観的排他制御
);

create index if not exists idx_listing_drafts_product on listing_drafts (product_id);
create index if not exists idx_listing_drafts_status on listing_drafts (status);

-- ============================================================
-- §17 listing_aspect_values
-- ============================================================
create table if not exists listing_aspect_values (
  id uuid primary key default gen_random_uuid(),
  listing_draft_id uuid not null references listing_drafts (id) on delete cascade,

  aspect_name text not null,
  value_json jsonb not null, -- multi-value Aspectにも対応

  required boolean not null default false,
  usage text check (usage in ('REQUIRED', 'RECOMMENDED', 'OPTIONAL')),

  data_type text,
  cardinality text,

  source text check (source in ('ebay_default', 'ai', 'human')),
  confidence numeric(4, 3),

  confirmed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aspect_values_draft on listing_aspect_values (listing_draft_id);
create unique index if not exists idx_aspect_values_draft_name
  on listing_aspect_values (listing_draft_id, aspect_name);

-- ============================================================
-- §18 listings (公開後)
-- ============================================================
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null references products (id) on delete cascade,
  listing_draft_id uuid references listing_drafts (id),

  sku text not null,

  ebay_listing_id text,
  ebay_offer_id text,

  marketplace_id text not null default 'EBAY_US',
  category_id text,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ENDED', 'SOLD_OUT', 'ERROR')),

  published_at timestamptz,
  ended_at timestamptz,
  sold_at timestamptz,

  created_by uuid not null references profiles (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_product on listings (product_id);
create unique index if not exists idx_listings_ebay_listing_id on listings (ebay_listing_id)
  where ebay_listing_id is not null;

-- ============================================================
-- §19-20 eBayキャッシュ(正本ではない。参照専用)
-- ============================================================
create table if not exists ebay_category_cache (
  marketplace_id text not null,
  category_tree_id text not null,
  category_id text not null,

  category_name text not null,
  parent_category_id text,

  leaf boolean not null default true,

  updated_at timestamptz not null default now(),

  primary key (marketplace_id, category_tree_id, category_id)
);

create table if not exists ebay_aspect_cache (
  marketplace_id text not null,
  category_id text not null,

  aspect_name text not null,

  required boolean not null default false,
  usage text,

  data_type text,
  cardinality text,
  allowed_values_json jsonb,

  expected_required_by_date date,
  raw_json jsonb,

  updated_at timestamptz not null default now(),

  primary key (marketplace_id, category_id, aspect_name)
);

-- §110 step8: eBay Metadata API(get_item_condition_policies)の結果キャッシュ。
-- 既存プロジェクトへは condition_cache.sql を別途実行してください。
create table if not exists ebay_condition_cache (
  marketplace_id text not null,
  category_id text not null,

  condition_id text not null,
  condition_description text not null,

  updated_at timestamptz not null default now(),

  primary key (marketplace_id, category_id, condition_id)
);

-- ============================================================
-- §21-22 orders / order_items (Phase2)
-- ============================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),

  ebay_order_id text not null unique,

  buyer_country text,
  order_status text,

  creation_date timestamptz,

  total_amount numeric(12, 2),
  currency text,

  raw_json jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references orders (id) on delete cascade,

  ebay_line_item_id text,

  listing_id uuid references listings (id),
  product_id uuid references products (id),

  sku text,

  quantity integer not null default 1,

  sale_price numeric(12, 2),
  currency text,

  shipping_amount numeric(12, 2),

  created_at timestamptz not null default now()
);

-- ============================================================
-- §23 finance_transactions (Phase2)
-- ============================================================
create table if not exists finance_transactions (
  id uuid primary key default gen_random_uuid(),

  ebay_transaction_id text not null unique,
  ebay_order_id text,

  transaction_type text,

  amount numeric(12, 2),
  currency text,

  fee_type text,

  raw_json jsonb,

  transaction_date timestamptz
);

-- ============================================================
-- §24 shipping_actuals (Phase2)
-- ============================================================
create table if not exists shipping_actuals (
  id uuid primary key default gen_random_uuid(),

  order_id uuid references orders (id) on delete cascade,

  carrier text,
  service text,

  actual_shipping_cost numeric(12, 2),
  currency text,

  tracking_number text,

  entered_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- §25-26 ai_runs / ai_suggestions
-- ============================================================
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),

  product_id uuid references products (id) on delete cascade,

  purpose text not null, -- analyze_product / translate / generate_title / fill_aspects / suggest_price / suggest_shipping
  model text not null,

  input_hash text not null, -- §85: 同一input_hashで再実行防止

  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 4),

  status text not null default 'SUCCEEDED' check (status in ('SUCCEEDED', 'FAILED')),

  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_runs_input_hash on ai_runs (input_hash);
create index if not exists idx_ai_runs_product on ai_runs (product_id);

create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),

  ai_run_id uuid references ai_runs (id) on delete cascade,
  product_id uuid references products (id) on delete cascade,

  field_name text not null,
  suggested_value_json jsonb not null,

  reason text,
  confidence numeric(4, 3),

  accepted boolean,
  final_value_json jsonb,

  created_at timestamptz not null default now()
);

-- ============================================================
-- §27 audit_logs
-- ============================================================
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references profiles (id),

  entity_type text not null,
  entity_id uuid,

  action text not null,

  before_json jsonb,
  after_json jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_organization on audit_logs (organization_id);
create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);

-- ============================================================
-- §28 sync_jobs
-- ============================================================
create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),

  type text not null, -- orders / finances / categories / aspects
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),

  started_at timestamptz,
  completed_at timestamptz,

  cursor text,

  result_json jsonb,
  error_json jsonb
);

-- ============================================================
-- §29 Row Level Security
-- ============================================================
-- 方針: 各テーブルにorganization_idを(直接 or JOIN経由で)持たせ、
-- auth.uid() に紐づくprofiles.organization_idと一致する行のみ許可する。
-- 管理系の書き込み(Publish, トークン発行等)はRoute Handler内で
-- service_role(admin client)を使い、アプリ側で権限チェックを行う。

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table ebay_accounts enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table listing_drafts enable row level security;
alter table listing_aspect_values enable row level security;
alter table listings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table finance_transactions enable row level security;
alter table shipping_actuals enable row level security;
alter table ai_runs enable row level security;
alter table ai_suggestions enable row level security;
alter table audit_logs enable row level security;

-- §19-20: eBayキャッシュテーブルは正本ではない参照専用データ(組織に紐づかない)のため、
-- RLSは意図的に無効のままにする。Supabaseプロジェクトによっては新規テーブル作成時に
-- RLSが自動で有効化されることがあるため、明示的にdisableしておく(冪等)。
alter table ebay_category_cache disable row level security;
alter table ebay_aspect_cache disable row level security;
alter table ebay_condition_cache disable row level security;

-- ヘルパー: 現在ログイン中ユーザーのorganization_id
create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where auth_user_id = auth.uid();
$$;

create policy "profiles: same organization select"
  on profiles for select
  using (organization_id = current_organization_id());

create policy "products: same organization"
  on products for all
  using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy "product_images: via product organization"
  on product_images for all
  using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "listing_drafts: via product organization"
  on listing_drafts for all
  using (
    exists (
      select 1 from products p
      where p.id = listing_drafts.product_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "listing_aspect_values: via draft organization"
  on listing_aspect_values for all
  using (
    exists (
      select 1 from listing_drafts d
      join products p on p.id = d.product_id
      where d.id = listing_aspect_values.listing_draft_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "listings: via product organization"
  on listings for all
  using (
    exists (
      select 1 from products p
      where p.id = listings.product_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "ebay_accounts: same organization"
  on ebay_accounts for select
  using (organization_id = current_organization_id());

create policy "ai_runs: via product organization"
  on ai_runs for all
  using (
    product_id is null or exists (
      select 1 from products p
      where p.id = ai_runs.product_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "ai_suggestions: via product organization"
  on ai_suggestions for all
  using (
    product_id is null or exists (
      select 1 from products p
      where p.id = ai_suggestions.product_id
        and p.organization_id = current_organization_id()
    )
  );

create policy "audit_logs: same organization select"
  on audit_logs for select
  using (organization_id = current_organization_id());

-- §110 step11: Publish時にaudit_logsへINSERTするためのポリシー(元々SELECTのみだった)。
create policy "audit_logs: same organization insert"
  on audit_logs for insert
  with check (organization_id = current_organization_id());

-- NOTE: orders/order_items/finance_transactions/shipping_actuals は
-- Phase2でorganization紐付け方法(複数事業者対応含む)を確定してから
-- 本格的なRLSポリシーを追加する。現時点ではservice_role経由の
-- Backend処理のみを想定し、テーブル自体はRLS有効化のみ行っている。
