import { createClient } from '@supabase/supabase-js';

/**
 * §29,§102: service_role keyはブラウザへ絶対渡さない。
 * このクライアントはサーバー専用コード(services/ repositories/ 内、
 * かつRoute Handler/Server Action経由)からのみ使用すること。
 * RLSをバイパスするため、呼び出し元でorganization_idのスコープ確認を必須とする。
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin client is not configured (missing env vars)');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
