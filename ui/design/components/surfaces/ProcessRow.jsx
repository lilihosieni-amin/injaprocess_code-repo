import React from 'react';
import { Badge } from '../core/Badge.jsx';
import { Button } from '../core/Button.jsx';
import { IconButton } from '../core/IconButton.jsx';

/**
 * A row in the process list: title + id, node count, tag, and two actions + delete.
 */
export function ProcessRow({ name, id, count = '۰', tag = 'مستند', tagTone = 'violet', onSummary, onFlow, onDelete, style = {} }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-warm)', borderRadius: 'var(--radius-card)',
      padding: '17px 19px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--shadow-row)', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-strong)' }}>{name}</span>
          <Badge tone={tagTone}>{tag}</Badge>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)', marginTop: 4 }} dir="ltr">{id}</div>
      </div>
      <div style={{ textAlign: 'center', flex: 'none', minWidth: 52 }}>
        <div style={{ fontWeight: 800, fontSize: '17px', color: 'var(--inja-violet)' }}>{count}</div>
        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>فعالیت</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
        <Button variant="secondary" size="sm" onClick={onSummary}>اطلاعات کلی</Button>
        <Button variant="primary" size="sm" onClick={onFlow}>فلوچارت</Button>
        <IconButton tone="danger" title="حذف فرآیند" onClick={onDelete}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></svg>
        </IconButton>
      </div>
    </div>
  );
}
