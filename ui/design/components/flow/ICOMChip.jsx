import React from 'react';

const ROLES = {
  input:   { color: 'var(--icom-input-fg)', background: 'var(--icom-input-bg)' },
  control: { color: 'var(--icom-control-fg)', background: 'var(--icom-control-bg)' },
  output:  { color: 'var(--icom-output-fg)', background: 'var(--icom-output-bg)' },
  mechanism: { color: 'var(--icom-mech-fg)', background: 'var(--icom-mech-bg)' },
};

/**
 * IDEF0 ICOM chip — role-colored soft tag for inputs/controls/outputs/mechanisms.
 */
export function ICOMChip({ role = 'input', children, style = {}, ...rest }) {
  const r = ROLES[role] || ROLES.input;
  return (
    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: 'var(--radius-chip)', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)', ...r, ...style }} {...rest}>{children}</span>
  );
}
