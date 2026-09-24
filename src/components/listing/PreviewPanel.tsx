'use client';

import { useState } from 'react';
import type { ListingFormState } from '@/types/listing';
import { buildDescriptionHtml, buildSpecificsText } from '@/lib/listing/templateHtml';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const ok = await copyText(getText());
          setDone(ok);
          setTimeout(() => setDone(null), 1600);
        }}
      >
        {done === null ? label : done ? 'コピーしました' : 'コピーできませんでした'}
      </button>
    </div>
  );
}

/**
 * §52: HTMLプレビュー(iframe)は維持。
 * §111: 「まとめてコピー(拡張機能用)」は新eBay API出品が安定するまでの
 * 移行措置として残す。安定後に削除しChrome拡張を正式廃止する。
 */
export function PreviewPanel({ state }: { state: ListingFormState }) {
  const html = buildDescriptionHtml(state, false);
  const previewHtml = buildDescriptionHtml(state, true);
  const specificsText =
    buildSpecificsText(state) || '(ジャンルを選択し、項目を入力するとここに表示されます)';

  const bundlePayload = [
    '[EBAY-DESK-DRAFT]',
    `TITLE: ${state.title}`,
    `CONDITION: ${state.condition}`,
    `CATEGORY: ${state.category}`,
    '---DESCRIPTION-HTML---',
    html,
  ].join('\n');

  return (
    <div className="preview-col">
      <div className="card" style={{ borderStyle: 'dashed' }}>
        <div className="legend-row">
          <h2 style={{ fontSize: '1rem' }}>プレビュー</h2>
          <span className="hint">拡張機能に貼り付け用(移行期間中のみ・§111)</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p className="subnote" style={{ marginBottom: 10 }}>
            TODO(§67-76): 新方式ではここは廃止し、代わりに「eBay Sandboxへ出品」ボタン
            (POST /api/ebay/listings/publish)に置き換える。
          </p>
          <button
            type="button"
            className="btn primary"
            style={{ width: '100%' }}
            onClick={() => copyText(bundlePayload)}
          >
            まとめてコピー(拡張機能用・旧方式)
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 6 }}>
            見た目プレビュー
          </div>
          <iframe className="render-frame" title="説明文プレビュー" srcDoc={previewHtml} sandbox="" />
        </div>

        <details>
          <summary style={{ fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer' }}>
            個別にコピーしたい場合
          </summary>

          <div style={{ marginTop: 14 }}>
            <div className="hint">タイトル ({state.title.length} / 80)</div>
            <div className="out-box" style={{ maxHeight: 'none' }}>
              {state.title}
            </div>
            <CopyButton getText={() => state.title} label="タイトルをコピー" />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="hint">状態(Item Condition)</div>
            <div className="out-box" style={{ maxHeight: 'none' }}>
              {state.condition}
            </div>
            <CopyButton getText={() => state.condition} label="状態をコピー" />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="hint">商品仕様(Item Specifics・ジャンル別)</div>
            <div className="out-box" style={{ maxHeight: 'none' }}>
              {specificsText}
            </div>
            <CopyButton getText={() => buildSpecificsText(state)} label="商品仕様をコピー" />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="hint">説明文 HTML(コピーしてeBayのHTML編集欄に貼り付け)</div>
            <div className="out-box">{html}</div>
            <CopyButton getText={() => html} label="HTMLをコピー" />
          </div>
        </details>
      </div>
    </div>
  );
}
