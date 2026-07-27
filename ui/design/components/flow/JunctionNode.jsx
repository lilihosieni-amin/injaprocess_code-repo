import React from 'react';

const COLORS = { XOR: 'var(--junction-xor)', AND: 'var(--junction-and)', OR: 'var(--junction-or)' };

/**
 * IDEF3 junction — a rotated square (diamond) carrying its logic type (XOR/AND/OR).
 */
export function JunctionNode({ type = 'XOR', size = 46, selected = false, style = {}, ...rest }) {
  const c = COLORS[type] || COLORS.XOR;
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }} {...rest}>
      <div style={{ position: 'absolute', inset: 0, transform: 'rotate(45deg)', borderRadius: 8,
        background: '#fff', border: `2.5px solid ${c}`, boxShadow: selected ? `0 8px 20px -8px ${c}` : 'var(--shadow-row)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10.5px', fontWeight: 800, color: c, direction: 'ltr' }}>{type}</div>
    </div>
  );
}
