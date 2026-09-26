'use client';

import { useState, useTransition } from 'react';
import { updateListingQuantity } from '@/app/(app)/listings/quantityActions';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面の在庫同期(数量変更)セル。
 * PriceEditCell.tsxと同じ設計。ACTIVE(出品中)のListingのみ編集可能。
 */
type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

export function QuantityEditCell({
  listingId,
  initialQuantity,
  editable,
}: {
  listingId: string;
  initialQuantity: number | null;
  editable: boolean;
}) {
  const [value, setValue] = useState(initialQuantity !== null ? String(initialQuantity) : '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  if (!editable) {
    return <span>{initialQuantity ?? '-'}</span>;
  }

  function handleUpdate() {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      const result = await updateListingQuantity(listingId, value);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? '更新に失敗しました。' });
        return;
      }
      setStatus({ kind: 'saved' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="number"
          step="1"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          style={{ width: 70 }}
        />
        <button
          type="button"
          className="btn"
          onClick={handleUpdate}
          disabled={isPending}
          style={{ fontSize: '.75rem', padding: '2px 8px' }}
        >
          {isPending ? '更新中...' : '更新'}
        </button>
      </div>
      {status.kind === 'saved' && (
        <span style={{ fontSize: '.72rem', color: 'var(--accent)' }}>eBayへ反映しました</span>
      )}
      {status.kind === 'error' && (
        <span style={{ fontSize: '.72rem', color: 'crimson' }}>{status.message}</span>
      )}
    </div>
  );
}
