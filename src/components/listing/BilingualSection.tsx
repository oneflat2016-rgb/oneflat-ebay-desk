'use client';

import { useState } from 'react';
import type { BilingualText } from '@/types/listing';

interface Props {
  sectionNumber: number;
  heading: string;
  hint?: string;
  description: string;
  value: BilingualText;
  onChange: (value: BilingualText) => void;
  idPrefix: string;
}

/**
 * §45-46に対応:
 * - 日本語入力(下書き確認用)/英語入力(出力用)は維持
 * - 翻訳ボタンはClaude Artifact固有API(window.claude.use)や
 *   MyMemory無料APIフォールバックを使わず、必ずBackend経由の
 *   POST /api/ai/translate を呼ぶ(§46,§100: AIが落ちていても手入力で続行可能)
 */
export function BilingualSection({
  sectionNumber,
  heading,
  hint,
  description,
  value,
  onChange,
  idPrefix,
}: Props) {
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | '' }>({
    text: '',
    kind: '',
  });
  const [translating, setTranslating] = useState(false);

  async function handleTranslate() {
    if (!value.ja.trim()) {
      setStatus({ text: '日本語欄が空です。先に日本語で入力してください。', kind: 'warn' });
      return;
    }
    setTranslating(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value.ja }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { text: string };
      onChange({ ...value, en: data.text });
    } catch (err) {
      setStatus({
        text:
          'AI翻訳が利用できませんでした。お手数ですが英語欄に手入力をお願いします。' +
          (err instanceof Error ? ` (${err.message})` : ''),
        kind: 'err',
      });
    } finally {
      setTranslating(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2>
          {sectionNumber}. {heading}
        </h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <p className="subnote">{description}</p>
      <div className="bilingual-grid">
        <div className="field">
          <div className="lang-tag-row">
            <span className="lang-tag">日本語(下書き確認用・出力には含まれません)</span>
            <button type="button" className="btn ghost" disabled={translating} onClick={handleTranslate}>
              {translating ? '変換中…' : '→ 英語に変換'}
            </button>
          </div>
          <textarea
            id={`${idPrefix}-ja`}
            value={value.ja}
            onChange={(e) => onChange({ ...value, ja: e.target.value })}
          />
          {status.text && (
            <span
              className="subnote"
              style={{ color: status.kind === 'err' ? 'var(--danger)' : 'var(--accent-2)' }}
            >
              {status.text}
            </span>
          )}
        </div>
        <div className="field">
          <span className="lang-tag">English</span>
          <textarea
            id={`${idPrefix}-en`}
            value={value.en}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
