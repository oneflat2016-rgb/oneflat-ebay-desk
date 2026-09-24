-- ONEFLAT eBay Listing Desk - Supabase Storage設定(Phase1-STEP4, §110 step4)
-- schema.sql実行後、追加でこのファイルをSQL Editorで実行してください。
-- 商品写真をアップロードするための非公開(private)バケットと、
-- 組織単位でアクセスを制限するRLSポリシーを作成します。
--
-- 保存パスの規約: <organization_id>/<product_id>/<uuid>.<ext>
-- (先頭フォルダ = organization_idであることをRLSで強制する)

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

create policy "product-images: same organization"
  on storage.objects
  for all
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = current_organization_id()::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = current_organization_id()::text
  );
