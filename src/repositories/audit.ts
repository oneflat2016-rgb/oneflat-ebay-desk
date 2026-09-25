/**
 * TODO(§27, §83): 実装対象。audit_logsへの書き込み。
 * 最低限記録すべきaction: 商品作成/AI解析/Category変更/Condition変更/
 * Price変更/Shipping変更/Description変更/Publish/Listing更新/Listing終了。
 */
export async function writeAuditLog(_params: {
  organizationId: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}): Promise<void> {
  throw new Error('writeAuditLog is not implemented yet (§27, §83)');
}
