import React from 'react';

/**
 * Base white surface: warm border, soft violet shadow, 16px radius. Optional hover lift.
 */
export function Card({ hover = false, pad = 20, children, style = {}, ...rest }) {
  return (
    <div
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-warm)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card-lg)', padding: pad,
        transition: 'transform var(--ease), box-shadow var(--ease)', ...style }}
      onMouseEnter={(e) => { if (hover) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; } }}
      onMouseLeave={(e) => { if (hover) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card-lg)'; } }}
      {...rest}
    >{children}</div>
  );
}
