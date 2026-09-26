'use client';

import { useState, useTransition } from 'react';
import { relistListing } from '@/app/(app)/listings/relistActions';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面の再出品ボタン。
 * ENDED(終了済み)のListingにのみ表示する。
 */
type Phase = 'idle' | 'done' | 'error';

export function RelistButton({ listingId, editable }: { listingId: string; editable: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editable) {
    return null;
  }

  if (phase === 'done') {
    return <span style={{ fontSize: '.78rem', color: 'var(--accent)' }}>{message}</span>;
  }

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await relistListing(listingId);
      if (!result.ok) {
        setPhase('error');
        setMessage(result.error ?? '再出品に失敗しました。');
        return;
      }
      setPhase('done');
      setMessage(`再出品しました(新Listing ID: ${result.listingId})。画面を再読み込みすると一覧に反映されます。`);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
      <button
        type="button"
        className="btn"
        onClick={handleClick}
        disabled={isPending}
        style={{ fontSize: '.75rem', padding: '2px 8px' }}
      >
        {isPending ? '再出品中...' : '再出品する'}
      </button>
      {phase === 'error' && message && (
        <span style={{ fontSize: '.72rem', color: 'crimson' }}>{message}</span>
      )}
    </div>
  );
}
