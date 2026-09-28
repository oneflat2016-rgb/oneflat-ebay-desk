import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * §10(最新実装指示書): sync_jobs のCRUD。
 * 前回どこまで同期できたか(cursor)を記録し、次回はそこから続きを取得する
 * (§85相当: 毎回全件取得しない)。
 */

export type SyncJobType = 'orders' | 'finances';

export async function getLastSuccessfulCursor(type: SyncJobType): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('sync_jobs')
    .select('cursor')
    .eq('type', type)
    .eq('status', 'SUCCEEDED')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.cursor as string | null) ?? null;
}

export async function recordSyncJobSuccess(
  type: SyncJobType,
  params: { startedAt: string; cursor: string | null; resultJson: unknown },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('sync_jobs').insert({
    type,
    status: 'SUCCEEDED',
    started_at: params.startedAt,
    completed_at: new Date().toISOString(),
    cursor: params.cursor,
    result_json: params.resultJson,
  });
  if (error) throw error;
}

export async function recordSyncJobFailure(
  type: SyncJobType,
  params: { startedAt: string; errorJson: unknown },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('sync_jobs').insert({
    type,
    status: 'FAILED',
    started_at: params.startedAt,
    completed_at: new Date().toISOString(),
    error_json: params.errorJson,
  });
  if (error) throw error;
}
