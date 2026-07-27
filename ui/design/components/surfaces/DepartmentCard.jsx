import React from 'react';

/**
 * Department feature card: colored top bar, ghosted index numeral, icon tile,
 * stat row, and a footer CTA with circular chevron. Coral vs violet accent via `accent`.
 */
export function DepartmentCard({ name, icon, index = '۰۱', count = '۰', accent = 'violet', subs = null, conflicts = null, onOpen, style = {} }) {
  const isCoral = accent === 'coral';
  const accentColor = isCoral ? 'var(--danger)' : 'var(--inja-violet)';
  const accentSoft = isCoral ? '#FBE4E1' : '#EDE4FA';
  const tileBg = isCoral ? 'var(--surface-coral-soft)' : 'var(--surface-violet-soft)';
  const tileFg = isCoral ? 'var(--danger)' : 'var(--inja-violet)';
  return (
    <div onClick={onOpen}
      style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--border-warm)',
        borderRadius: 'var(--radius-card-lg)', padding: 22, cursor: 'pointer', boxShadow: 'var(--shadow-card-lg)',
        transition: 'transform var(--ease), box-shadow var(--ease)', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card-lg)'; }}>
      <div style={{ position: 'absolute', top: 0, insetInline: 0, height: 4, background: accentColor }} />
      <div style={{ position: 'absolute', top: 14, insetInlineEnd: 20, fontSize: 46, fontWeight: 800, lineHeight: 1, color: accentSoft, pointerEvents: 'none' }}>{index}</div>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-tile)', background: tileBg, color: tileFg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </div>
      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-strong)', marginTop: 16 }}>دپارتمان {name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 11, minHeight: 24 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11.5px', fontWeight: 600, color: '#6B5CA5', background: 'var(--surface-violet-softer)', padding: '4px 10px', borderRadius: 'var(--radius-pill)' }}>{count} فرآیند</span>
        {subs && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-soft)', padding: '4px 9px', borderRadius: 'var(--radius-pill)' }}>{subs} زیرفرآیند</span>}
        {conflicts && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-soft)', padding: '4px 9px', borderRadius: 'var(--radius-pill)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--inja-coral)' }} />{conflicts} تعارض</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, paddingTop: 15, borderTop: '1px solid var(--border-hairline)' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: accentColor }}>مشاهدهٔ فرآیندها</span>
        <div style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isCoral ? '#FFF0EE' : '#F3EDFC', color: accentColor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </div>
      </div>
    </div>
  );
}
