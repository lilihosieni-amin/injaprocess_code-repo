import React from 'react';

/**
 * Conflict/status pill with a leading dot — e.g. "۲ تعارض باز".
 */
export function StatusPill({ tone = 'danger', children, style = {}, ...rest }) {
  const TONES = {
    danger: { color: 'var(--danger)', background: 'var(--danger-soft)', dot: 'var(--inja-coral)' },
    ok:     { color: 'var(--ok)', background: 'var(--ok-soft)', dot: 'var(--ok)' },
    warn:   { color: 'var(--warn)', background: 'var(--warn-soft)', dot: 'var(--warn)' },
  };
  const t = TONES[tone] || TONES.danger;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 700,
      padding: '4px 9px', borderRadius: 'var(--radius-pill)', color: t.color, background: t.background, ...style }} {...rest}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot }} />
      {children}
    </span>
  );
}
