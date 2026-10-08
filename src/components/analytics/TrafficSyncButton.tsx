'use client';

import { useState, useTransition } from 'react';

/**
 * §34(Phase6実装仕様, 2026-10-08): View/Watch分析の手動同期ボタン。
 * POST /api/ebay/sync/traffic を呼び、完了したら画面をリロードして
 * 一覧に反映する(src/components/sales/SalesSyncButtons.tsxと同じパターン)。
 */
export function TrafficSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleSync() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      try {
        const res = await fetch('/api/ebay/sync/traffic', { method: 'POST' });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.message ?? 'View/Watchの同期に失敗しました。');
        }
        const failedNote = body?.failedCount > 0 ? `(${body.failedCount}件は取得失敗)` : '';
        setMessage(`同期しました(${body?.snapshotsRecorded ?? 0}件)${failedNote}。ページを再読み込みすると一覧に反映されます。`);
      } catch (err) {
        setIsError(true);
        setMessage(err instanceof Error ? err.message : '同期に失敗しました。');
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button type="button" className="btn" onClick={handleSync} disabled={isPending}>
        {isPending ? 'eBayと同期しています…' : 'View/Watchを同期'}
      </button>
      {message && (
        <span className="subnote" style={{ color: isError ? 'var(--danger)' : 'var(--accent)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
