import React from 'react';

const TONES = {
  violet:  { color: 'var(--inja-violet)', background: 'var(--surface-violet-soft)' },
  warn:    { color: 'var(--warn)', background: 'var(--warn-soft)' },
  danger:  { color: 'var(--danger)', background: 'var(--danger-soft)' },
  ok:      { color: 'var(--ok)', background: 'var(--ok-soft)' },
  neutral: { color: '#6B5CA5', background: 'var(--surface-violet-softer)' },
};

/**
 * Small rounded tag/badge. Used for "مستند", "دارای KPI", process-id chips, etc.
 */
export function Badge({ tone = 'violet', mono = false, children, style = {}, ...rest }) {
  const t = TONES[tone] || TONES.violet;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '10.5px', fontWeight: 600,
      padding: '2px 8px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', direction: mono ? 'ltr' : 'inherit', ...t, ...style }} {...rest}>
      {children}
    </span>
  );
}
