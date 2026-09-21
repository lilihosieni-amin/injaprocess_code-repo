import { Link } from 'react-router-dom'
import type { Comment } from '../api/comments'
import { STATUS, ageText, statusLabel } from '../lib/comments'
import { useSurface } from '../ui/surface'

/**
 * A comment as a drawer lists it: the id, the status, the age, the AUTHOR's
 * text (never a replacement — notes live in the inbox, addendum §7.5), the
 * author and «باز کردن در صندوق کامنت‌ها».
 *
 * `flow` — the flow drawers, Reader L637–652 (= Reader L625–653, Panel L977–991).
 * `panelDept` — the Panel department drawer, Panel L2926–2936.
 * The design's « · {authorRole}» is not drawn: the comment JSON carries no role.
 * Leadings follow ledger L-17: 1.85 → --lh-sub, 1.9 → --lh-loose.
 */
const PLACE = {
  flow: {
    card: 'bg-tile-v4 p-s6', head: 'gap-button-icon', id: 'text-fs-nano px-button-icon',
    chip: 'text-fs-nano px-s4', age: 'text-fs-nano', text: 'text-fs-sm2 leading-sub',
    by: 'gap-s3 text-fs-micro', open: 'text-fs-xs',
  },
  panelDept: {
    card: 'bg-surface-sub py-compose px-s7', head: 'gap-s4', id: 'text-fs-micro px-s4',
    chip: 'text-fs-micro px-option', age: 'text-fs-micro', text: 'text-fs-menu leading-loose',
    by: 'gap-button-icon text-fs-xs', open: 'text-fs-caption',
  },
} as const

export function MiniCard({ c, place = 'flow' }: { c: Comment; place?: keyof typeof PLACE }) {
  const surface = useSurface()
  const z = PLACE[place]
  const st = STATUS[c.state]
  return (
    <div className={`border border-border-current rounded-button mb-s5 ${z.card}`}>
      <div className={`flex items-center flex-wrap mb-s4 ${z.head}`}>
        <span dir="ltr" className={`font-mono py-half rounded-badge bg-card text-muted ${z.id}`}>{c.id}</span>
        <span className={`font-semibold py-half rounded-pill ${st.bg} ${st.fg} ${z.chip}`}>{statusLabel(c.state, surface)}</span>
        <span className={`ms-auto text-faint ${z.age}`}>{ageText(c.createdAt)}</span>
      </div>
      <div className={`text-ink whitespace-pre-line [text-wrap:pretty] ${z.text}`}>{c.text}</div>
      <div className={`flex items-center mt-option text-muted ${z.by}`}>
        <span className="font-semibold text-ink-current">{c.author.name}</span>
      </div>
      <Link to={`/comments?c=${encodeURIComponent(c.id)}`}
        className={`block w-fit mt-s5 font-bold text-violet underline underline-offset-4 ${z.open}`}>
        باز کردن در صندوق کامنت‌ها
      </Link>
    </div>
  )
}
