import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * §9, §13: ebay_accounts のCRUD(§110 step9)。
 * §102: refresh_token_encryptedへの書き込みはRLSで禁止されている
 * (ebay_accountsのRLSポリシーはselectのみ許可, supabase/schema.sql参照)ため、
 * 書き込みは必ずservice_role(admin client)を使い、呼び出し元(Route Handler)で
 * ADMIN Roleチェックを行った上で呼ぶこと(§29)。
 */

export interface EbayAccountRecord {
  id: string;
  organizationId: string;
  marketplaceId: string;
  ebayUserId: string | null;
  tokenScope: string | null;
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR';
  lastVerifiedAt: string | null;
  updatedAt: string;
}

function fromRow(row: Record<string, unknown>): EbayAccountRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    marketplaceId: row.marketplace_id as string,
    ebayUserId: (row.ebay_user_id as string | null) ?? null,
    tokenScope: (row.token_scope as string | null) ?? null,
    connectionStatus: row.connection_status as EbayAccountRecord['connectionStatus'],
    lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/** §29: RLS経由(同一組織のみ閲覧可)。設定画面での表示に使う。 */
export async function getEbayAccountForOrganization(
  organizationId: string,
): Promise<EbayAccountRecord | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ebay_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/**
 * §102: refresh_token_encryptedはこの関数の外(呼び出し元)で暗号化済みの文字列を渡すこと。
 * この関数自体は平文トークンを一切扱わない。
 */
export async function upsertEbayAccountConnection(params: {
  organizationId: string;
  marketplaceId: string;
  ebayUserId: string | null;
  refreshTokenEncrypted: string;
  tokenScope: string;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('ebay_accounts').upsert(
    {
      organization_id: params.organizationId,
      marketplace_id: params.marketplaceId,
      ebay_user_id: params.ebayUserId,
      refresh_token_encrypted: params.refreshTokenEncrypted,
      token_scope: params.tokenScope,
      connection_status: 'CONNECTED',
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );
  if (error) throw error;
}

export async function disconnectEbayAccount(organizationId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('ebay_accounts')
    .update({
      connection_status: 'DISCONNECTED',
      refresh_token_encrypted: null,
      token_scope: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);
  if (error) throw error;
}

/** §102: 呼び出し元(Inventory API連携, step10以降)が復号して使う。管理操作なのでadmin clientを使う。 */
export async function getEncryptedRefreshToken(organizationId: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ebay_accounts')
    .select('refresh_token_encrypted')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.refresh_token_encrypted as string | null) ?? null;
}
