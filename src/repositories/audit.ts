import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * §27, §83(§110 step11で実装): audit_logsへの書き込み。
 * 最低限記録すべきaction: 商品作成/AI解析/Category変更/Condition変更/
 * Price変更/Shipping変更/Description変更/Publish/Listing更新/Listing終了。
 * Phase1では、まずPublish(§66-71)のみここから呼ぶ。他のactionは各機能の
 * 実装状況に応じて呼び出し箇所を追加していく(§117-4: 存在しないログを捏造しない)。
 * §102: beforeJson/afterJsonにToken等の機密情報を絶対含めないこと(呼び出し元の責任)。
 * 監査ログの書き込み失敗でPublish自体を失敗させたくないため、呼び出し元は
 * このエラーをcatchしてログ出力に留めてよい。
 */
export async function writeAuditLog(params: {
  organizationId: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    before_json: params.beforeJson ?? null,
    after_json: params.afterJson ?? null,
  });
  if (error) throw error;
}
