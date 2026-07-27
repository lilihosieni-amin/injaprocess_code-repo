import React from 'react';

/**
 * Square icon-only button. Neutral, coral, or danger tone. Houses a 16–18px line-SVG.
 */
export function IconButton({ tone = 'neutral', size = 38, title, children, style = {}, ...rest }) {
  const TONES = {
    neutral: { background: '#fff', color: '#6B5CA5', border: '1.5px solid var(--border-violet)' },
    violet:  { background: 'var(--surface-violet-soft)', color: 'var(--inja-violet)', border: '1.5px solid transparent' },
    danger:  { background: '#FFF3F2', color: 'var(--danger)', border: '1.5px solid #FDD9D6' },
  };
  const t = TONES[tone] || TONES.neutral;
  return (
    <button title={title}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flex: 'none',
        borderRadius: 'var(--radius-control-lg)', cursor: 'pointer', transition: 'background var(--ease)', ...t, ...style }}
      onMouseEnter={(e) => { if (tone === 'danger') e.currentTarget.style.background = '#FDE7E5'; else e.currentTarget.style.background = '#F4EFFB'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = t.background; }}
      {...rest}
    >{children}</button>
  );
}
