'use client';

import { CHECKLIST_ITEMS, type ChecklistState } from '@/types/listing';

/**
 * TODO(§89-90): localStorageではなく商品(listing_drafts)単位でDB保存し、
 * 全項目チェック時にinspected_by/inspected_atを記録する。
 * カテゴリーによっては「動作確認」等を任意項目にする(§89)。
 */
export function ChecklistSection({
  checklist,
  onToggle,
}: {
  checklist: ChecklistState;
  onToggle: (id: string) => void;
}) {
  const checkedCount = CHECKLIST_ITEMS.filter((item) => checklist[item.id]).length;
  const total = CHECKLIST_ITEMS.length;
  const allChecked = checkedCount === total;

  return (
    <section className="card" style={{ position: 'relative' }}>
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>出品前チェックリスト</h2>
        <span className="hint">
          {checkedCount} / {total}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${total ? (100 * checkedCount) / total : 0}%` }}
        />
      </div>
      <div className="check-list" style={{ marginTop: 14 }}>
        {CHECKLIST_ITEMS.map((item) => (
          <label className="check-row" key={item.id}>
            <input
              type="checkbox"
              checked={!!checklist[item.id]}
              onChange={() => onToggle(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      {allChecked && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            width: 74,
            height: 74,
            border: '2.5px solid var(--danger)',
            borderRadius: '50%',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: '0.62rem',
            textAlign: 'center',
            transform: 'rotate(-14deg)',
            lineHeight: 1.15,
          }}
        >
          検品済
          <br />
          INSPECTED
        </div>
      )}
    </section>
  );
}
