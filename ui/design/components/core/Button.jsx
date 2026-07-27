import React from 'react';

const VARIANTS = {
  primary: { background: 'var(--inja-violet)', color: '#fff', border: '1.5px solid var(--inja-violet)' },
  coral:   { background: 'var(--inja-coral)', color: '#fff', border: '1.5px solid var(--inja-coral)' },
  danger:  { background: 'var(--danger)', color: '#fff', border: '1.5px solid var(--danger)' },
  ok:      { background: 'var(--ok)', color: '#fff', border: '1.5px solid var(--ok)' },
  secondary: { background: '#fff', color: '#6B5CA5', border: '1.5px solid var(--border-violet)' },
  ghost:   { background: 'transparent', color: 'var(--inja-violet)', border: '1.5px solid transparent' },
};
const SIZES = {
  sm: { padding: '7px 12px', fontSize: '12px' },
  md: { padding: '9px 15px', fontSize: '13px' },
  lg: { padding: '12px 18px', fontSize: '14px' },
};

/**
 * Inja primary button. Verb/noun label, optional leading line-SVG icon.
 */
export function Button({ variant = 'primary', size = 'md', icon = null, block = false, disabled = false, children, style = {}, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  return (
    <button
      disabled={disabled}
      style={{
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : 'auto',
        alignItems: 'center', justifyContent: 'center', gap: 7,
        fontFamily: 'var(--font-sans)', fontWeight: 700, lineHeight: 1,
        borderRadius: 'var(--radius-control-lg)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'filter var(--ease), background var(--ease)',
        boxShadow: variant === 'danger' ? 'var(--shadow-coral)' : 'none',
        ...v, ...s, ...style,
      }}
      onMouseEnter={(e) => { if (!disabled && (variant === 'primary' || variant === 'coral' || variant === 'danger' || variant === 'ok')) e.currentTarget.style.filter = 'brightness(1.12)'; if (!disabled && (variant === 'ghost' || variant === 'secondary')) e.currentTarget.style.background = '#F4EFFB'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; if (variant === 'ghost') e.currentTarget.style.background = 'transparent'; if (variant === 'secondary') e.currentTarget.style.background = '#fff'; }}
      {...rest}
    >
      {icon}{children}
    </button>
  );
}
