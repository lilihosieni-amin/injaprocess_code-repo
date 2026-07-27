import React from 'react';

/**
 * Labelled text input. Focus border turns coral. Optional leading icon (search style).
 */
export function TextField({ label, icon = null, hint = null, dir, style = {}, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'block' }}>
      {label && <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', insetInlineStart: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-faint)', display: 'flex' }}>{icon}</span>}
        <input dir={dir}
          onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: icon ? '9px 34px 9px 12px' : '9px 12px',
            border: `1.5px solid ${focus ? 'var(--inja-coral)' : 'var(--border-violet)'}`, borderRadius: 'var(--radius-control)',
            fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-strong)', background: '#fff', outline: 'none',
            transition: 'border-color var(--ease)', ...style }}
          {...rest} />
      </div>
      {hint && <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.6 }}>{hint}</div>}
    </label>
  );
}
