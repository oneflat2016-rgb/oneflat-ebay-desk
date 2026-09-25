-- §110 step9 追加分: ebay_accounts.organization_id を一意にする(1組織1eBayアカウント)。
-- schema.sql実行済みのプロジェクトでは、既存のidx_ebay_accounts_organizationが
-- 非unique indexとして残っているため、これを削除してunique indexへ張り替える。
-- SQL Editorで実行してください(condition_cache.sqlと同じ位置づけの追加ファイル)。

drop index if exists idx_ebay_accounts_organization;
create unique index if not exists idx_ebay_accounts_organization on ebay_accounts (organization_id);
