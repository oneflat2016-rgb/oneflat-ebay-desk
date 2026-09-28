'use client';

import { useState, useTransition } from 'react';

/**
 * §10(最新実装指示書): 販売履歴の手動同期ボタン。
 * POST /api/ebay/sync/orders → POST /api/ebay/sync/finances の順に呼び、
 * 完了したら画面をリロードして一覧に反映する(§54: 取得結果は必ずDBへ保存済みなので、
 * リロード後は保存済みデータを読むだけで良い)。
 */
export function SalesSyncButtons() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleSync() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      try {
        const ordersRes = await fetch('/api/ebay/sync/orders', { method: 'POST' });
        const ordersBody = await ordersRes.json().catch(() => null);
        if (!ordersRes.ok) {
          throw new Error(ordersBody?.message ?? '注文の同期に失敗しました。');
        }

        const financesRes = await fetch('/api/ebay/sync/finances', { method: 'POST' });
        const financesBody = await financesRes.json().catch(() => null);
        if (!financesRes.ok) {
          throw new Error(financesBody?.message ?? '取引(手数料)の同期に失敗しました。');
        }

        setMessage(
          `同期しました(注文 ${ordersBody?.ordersUpserted ?? 0}件・明細 ${ordersBody?.itemsUpserted ?? 0}件・` +
            `取引 ${financesBody?.transactionsUpserted ?? 0}件)。ページを再読み込みすると一覧に反映されます。`,
        );
      } catch (err) {
        setIsError(true);
        setMessage(err instanceof Error ? err.message : '同期に失敗しました。');
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <button type="button" className="btn primary" onClick={handleSync} disabled={isPending}>
        {isPending ? 'eBayと同期しています…' : 'eBayと同期'}
      </button>
      {message && (
        <span className="subnote" style={{ color: isError ? 'var(--danger)' : 'var(--accent)', maxWidth: 320, textAlign: 'right' }}>
          {message}
        </span>
      )}
    </div>
  );
}
