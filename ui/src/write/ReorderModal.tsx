import { Fragment, useState } from 'react'
import { useSaveOrder } from '../api/hooks'
import { ApiError } from '../api/client'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { IdBadge } from '../ui/IdBadge'
import { toFa } from '../lib/format'
import type { Process } from '../api/types'

/**
 * §3.3's 540 dialog — the order of one department's processes.
 *
 * **O4 — dragging is not the only way in.** The rows were `draggable` with four
 * drag handlers and nothing else, so a keyboard or screen-reader user could open
 * this box, read the order, and save it exactly as they found it. Every row now
 * carries a labelled pair of move buttons beside the `⣿` handle, and the label
 * names the row it moves — «بردن «نام» به بالا» — because "up" alone is the same
 * accessible name on every row in the list.
 *
 * FR-I3 — nothing is written by moving a row. `seq` is a draft, and only
 * «ذخیرهٔ ترتیب» sends it.
 */
export function ReorderModal({ department, departmentName, processes, onClose }: {
  department: string
  departmentName: string
  processes: Process[]
  onClose: () => void
}) {
  // `processes` arrives already ordered from the backend; tombstones hold no position.
  const [seq, setSeq] = useState<Process[]>(() => processes.filter((p) => !p.tombstoned))
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const save = useSaveOrder(department)
  const toast = useToast()

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= seq.length) return
    const next = [...seq]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setSeq(next)
  }

  function endDrag() {
    setDragFrom(null)
    setOverIndex(null)
  }

  // Where the dragged row would land. Dropping on row i puts it AT index i, so
  // dragging up it comes to rest above that row and dragging down below it —
  // which is the gap we light up. Never marked over the row being dragged.
  const marksGapBefore = (i: number) => dragFrom !== null && overIndex === i && dragFrom > i
  const marksGapAfter = (i: number) => dragFrom !== null && overIndex === i && dragFrom < i

  function doSave() {
    save.mutate({ order: seq.map((p) => p.id) }, {
      onSuccess: () => { toast.show('ترتیب فرآیندها ذخیره شد'); onClose() },
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          toast.show('ترتیب تغییر کرده است؛ فهرست به‌روزرسانی شد. پنجرهٔ ترتیب‌دهی را دوباره باز کنید.')
          onClose()
        } else {
          toast.show('ذخیرهٔ ترتیب انجام نشد')
        }
      },
    })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title={`ترتیب فرآیندهای ${departmentName}`}
      subtitle={`${toFa(seq.length)} فرآیند · هر ردیف را بکشید و رها کنید، یا با کلیدهای بالا و پایین جابه‌جا کنید.`}
      footer={
        <div className="flex gap-s5">
          {/* nothing to order: saving would write an `order.json` for a department
              that ARD §4.6 keeps fileless until its first process */}
          <Button variant="coral" onClick={doSave} loading={save.isPending} loadingLabel="در حال ذخیره…"
            disabled={seq.length === 0} className="flex-1 px-s8 text-fs-menu">ذخیرهٔ ترتیب</Button>
          <Button variant="ghost" onClick={onClose} className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      {seq.length === 0 && (
        <div className="text-center py-empty-y text-faint text-fs-sm">فرآیندی برای ترتیب‌دادن وجود ندارد</div>
      )}
      <div className="flex flex-col gap-s2">
        {seq.map((p, i) => (
          <Fragment key={p.id}>
            {marksGapBefore(i) && <div data-testid="drop-indicator" className="h-hint rounded-pill bg-coral" />}
            <div
              data-testid="reorder-row"
              data-pid={p.id}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i) }}
              onDrop={() => { if (dragFrom !== null) moveTo(dragFrom, i); endDrag() }}
              onDragEnd={endDrag}
              className={`bg-card border border-warm rounded-button px-s6 py-s4 flex items-center gap-s5 cursor-grab ${dragFrom === i ? 'opacity-40 border-coral' : ''}`}
            >
              {/* §5.2 sanctions this glyph as a character rather than an SVG,
                  so it stays — but it is decoration now, not the only handle. */}
              <span className="text-faint text-fs-lg leading-none select-none" aria-hidden>⣿</span>
              <div className="flex flex-col shrink-0">
                <IconButton label={`بردن «${p.name}» به بالا`}
                  disabled={i === 0} onClick={() => moveTo(i, i - 1)}
                  icon={<Icon name="chevronUp" px={14} stroke={2.4} />} />
                <IconButton label={`بردن «${p.name}» به پایین`}
                  disabled={i === seq.length - 1} onClick={() => moveTo(i, i + 1)}
                  icon={<Icon name="chevronDown" px={14} stroke={2.4} />} />
              </div>
              <span className="font-extrabold text-fs-caption text-violet min-w-s10 text-center">{toFa(i + 1)}</span>
              <IdBadge>{p.id}</IdBadge>
              <span className="font-bold text-fs-sm2 text-ink flex-1 min-w-0 truncate">{p.name}</span>
              {p.parent && <span className="text-fs-tag px-s4 py-half rounded-pill font-semibold text-warn bg-tile-warn shrink-0">زیرفرآیند</span>}
            </div>
            {marksGapAfter(i) && <div data-testid="drop-indicator" className="h-hint rounded-pill bg-coral" />}
          </Fragment>
        ))}
      </div>
    </Dialog>
  )
}
