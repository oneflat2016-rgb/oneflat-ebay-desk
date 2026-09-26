'use client';

import { useState, useTransition } from 'react';
import { updateListingPrice } from '@/app/(app)/listings/priceActions';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面の価格改定セル。
 * ACTIVE(出品中)のListingのみ編集可能。それ以外(ENDED/SOLD_OUT/ERROR)は
 * 現在の価格をそのまま表示するだけにする。
 */
type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

export function PriceEditCell({
  listingId,
  initialPrice,
  currency,
  editable,
}: {
  listingId: string;
  initialPrice: string | null;
  currency: string | null;
  editable: boolean;
}) {
  const [value, setValue] = useState(initialPrice ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  if (!editable) {
    return <span>{initialPrice ? `${currency ?? ''} ${initialPrice}` : '-'}</span>;
  }

  function handleUpdate() {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      const result = await updateListingPrice(listingId, value);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? '更新に失敗しました。' });
        return;
      }
      setStatus({ kind: 'saved' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{currency ?? ''}</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          style={{ width: 90 }}
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
