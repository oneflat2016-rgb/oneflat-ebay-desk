'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * ブラウザ(Client Component)専用。anon keyのみ使用。
 * §102: service_role keyやSecretはこのファイル経由でも絶対に扱わない。
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
