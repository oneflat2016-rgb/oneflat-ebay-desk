import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * §34(Phase6実装仕様, 2026-10-08): View/Watch分析。
 * eBay Trading API(GetItem, src/services/ebay/trading.ts)から取得した
 * View数・Watch数を、取得するたびにスナップショットとして追記する
 * (traffic_snapshots, supabase/traffic_snapshots_setup.sql)。
 */

export interface TrafficSnapshotInput {
  listingId: string;
  viewItemCount: number | null;
  watchCount: number | null;
}

export async function recordTrafficSnapshots(snapshots: TrafficSnapshotInput[]): Promise<void> {
  if (snapshots.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('traffic_snapshots').insert(
    snapshots.map((s) => ({
      listing_id: s.listingId,
      view_item_count: s.viewItemCount,
      watch_count: s.watchCount,
    })),
  );
  if (error) throw error;
}

export interface LatestTrafficSnapshot {
  viewItemCount: number | null;
  watchCount: number | null;
  capturedAt: string;
}

/**
 * 複数Listingについて、最新1件のスナップショットだけをまとめて取得する。
 * (1回のクエリで全件取得し、JS側でlisting_idごとに最新1件だけ残す。
 * listing数が多くなった場合は要見直し、§32の getLastPriceDropMap と同じ方針)
 */
export async function getLatestTrafficSnapshotMap(
  listingIds: string[],
): Promise<Map<string, LatestTrafficSnapshot>> {
  const result = new Map<string, LatestTrafficSnapshot>();
  if (listingIds.length === 0) return result;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('traffic_snapshots')
    .select('listing_id, view_item_count, watch_count, captured_at')
    .in('listing_id', listingIds)
    .order('captured_at', { ascending: false });
  if (error) throw error;

  for (const row of data ?? []) {
    const listingId = row.listing_id as string;
    if (result.has(listingId)) continue;
    result.set(listingId, {
      viewItemCount: row.view_item_count === null ? null : Number(row.view_item_count),
      watchCount: row.watch_count === null ? null : Number(row.watch_count),
      capturedAt: row.captured_at as string,
    });
  }

  return result;
}
