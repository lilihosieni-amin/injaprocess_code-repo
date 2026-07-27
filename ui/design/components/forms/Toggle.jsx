import React from 'react';

/**
 * iOS-style pill toggle in brand colors. Green track when on.
 */
export function Toggle({ checked = false, onChange, label, style = {}, ...rest }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', ...style }} {...rest}>
      <span onClick={() => onChange && onChange(!checked)}
        style={{ position: 'relative', width: 38, height: 22, borderRadius: 'var(--radius-pill)', flex: 'none',
          transition: 'background var(--ease)', background: checked ? 'var(--ok)' : '#D8CEEC' }}>
        <span style={{ position: 'absolute', top: 2, insetInlineStart: checked ? 18 : 2, width: 18, height: 18,
          borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'all var(--ease)' }} />
      </span>
      {label && <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-strong)' }}>{label}</span>}
    </label>
  );
}
