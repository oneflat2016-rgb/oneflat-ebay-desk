-- §110 step8 追加分: eBay Metadata API(get_item_condition_policies)の結果キャッシュ。
-- schema.sql実行済みのプロジェクトでも、このファイルは追加で実行する必要があります
-- (storage.sqlと同じ位置づけ。SQL Editorで実行してください)。
-- ebay_category_cache / ebay_aspect_cache と同じ方針でRLSは設定しない
-- (正本ではない参照専用キャッシュ、§19-20)。

create table if not exists ebay_condition_cache (
  marketplace_id text not null,
  category_id text not null,

  condition_id text not null,
  condition_description text not null,

  updated_at timestamptz not null default now(),

  primary key (marketplace_id, category_id, condition_id)
);
