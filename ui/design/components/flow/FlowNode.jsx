import React from 'react';

/**
 * A flowchart activity/terminal box. Terminals (start/end) are pill-shaped and tinted;
 * activities are white cards with a centered title, actor line, and optional selection ring.
 */
export function FlowNode({ kind = 'activity', title, actor, selected = false, hasSub = false, style = {}, ...rest }) {
  if (kind === 'start' || kind === 'end') {
    const isStart = kind === 'start';
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 92, padding: '12px 22px',
        borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: '13px',
        background: isStart ? 'var(--surface-violet-soft)' : 'var(--surface-coral-soft)',
        color: isStart ? 'var(--inja-violet)' : 'var(--danger)',
        border: `1.5px solid ${isStart ? '#D9C9F5' : '#F5C9C5'}`, ...style }} {...rest}>{title || (isStart ? 'شروع' : 'پایان')}</div>
    );
  }
  return (
    <div style={{ position: 'relative', width: 176, background: 'var(--surface-card)', textAlign: 'center',
      border: `2px solid ${selected ? 'var(--inja-coral)' : 'var(--border-warm)'}`, borderRadius: 'var(--radius-card)',
      padding: '14px 15px', boxShadow: selected ? '0 10px 26px -12px rgba(250,90,82,.55)' : 'var(--shadow-row)', ...style }} {...rest}>
      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-strong)', lineHeight: 1.5, wordBreak: 'break-word' }}>{title}</div>
      {actor && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>{actor}</div>}
      {hasSub && <div style={{ position: 'absolute', bottom: -9, insetInlineStart: '50%', transform: 'translateX(50%)', width: 18, height: 18, borderRadius: '50%', background: 'var(--inja-violet)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px -2px rgba(74,37,169,.6)' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </div>}
    </div>
  );
}
