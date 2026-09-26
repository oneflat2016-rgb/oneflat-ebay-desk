'use client';

import { useState, useTransition } from 'react';
import { endListing } from '@/app/(app)/listings/endActions';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面のEnd Item(出品終了)ボタン。
 * 取り消せない操作なので、1回目のクリックでは確認表示のみ行い、
 * 「終了する」を明示的にもう一度押した場合だけ実際にendListingを呼ぶ
 * (ブラウザ標準のconfirm()は使わず、画面内で完結する2段階確認にする)。
 */
type Phase = 'idle' | 'confirming' | 'done' | 'error';

export function EndListingButton({ listingId, editable }: { listingId: string; editable: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editable) {
    return null;
  }

  if (phase === 'done') {
    return <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>終了済み</span>;
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => setPhase('confirming')}
        style={{ fontSize: '.75rem', padding: '2px 8px' }}
      >
        終了する
      </button>
    );
  }

  function handleConfirm() {
    setMessage(null);
    startTransition(async () => {
      const result = await endListing(listingId);
      if (!result.ok) {
        setPhase('error');
        setMessage(result.error ?? '終了に失敗しました。');
        return;
      }
      setPhase('done');
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
      <span style={{ fontSize: '.78rem' }}>本当に終了しますか?元に戻せません。</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="btn danger"
          onClick={handleConfirm}
          disabled={isPending}
          style={{ fontSize: '.75rem', padding: '2px 8px' }}
        >
          {isPending ? '処理中...' : '終了する(確定)'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setPhase('idle')}
          disabled={isPending}
          style={{ fontSize: '.75rem', padding: '2px 8px' }}
        >
          キャンセル
        </button>
      </div>
      {phase === 'error' && message && (
        <span style={{ fontSize: '.72rem', color: 'crimson' }}>{message}</span>
      )}
    </div>
  );
}
