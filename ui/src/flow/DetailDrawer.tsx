import { Chip } from '../ui/Chip'
import type { ProcNode, ActivityNode, JunctionNode, Pending, Process } from '../api/types'

export type DrawerProps = {
  node: ProcNode
  editing: boolean
  conflicts: { pending: Pending; index: number }[]
  process: Process
  onClose: () => void
  onEdit: () => void
  onAccept: (index: number) => void
  onReject: (index: number) => void
  onOpenSub: (subId: string) => void
  onPatch: (patch: Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>) => void
  onLinkSub: (subId: string | null) => void
  onSetJunction: (type: 'AND' | 'OR' | 'XOR') => void
  onCreateSub: () => void
}

export function DetailDrawer(props: DrawerProps) {
  const { node, onClose } = props
  const isActivity = node.type === 'activity'
  const a = node as ActivityNode
  const j = node as JunctionNode

  // Editing branch — scaffolded for Tasks 13–15; references all handlers so
  // noUnusedLocals is satisfied at the FlowScreen call site.
  if (props.editing) {
    return (
      <div className="absolute top-0 bottom-0 left-0 w-[340px] bg-white border-e border-warm shadow-[20px_0_50px_-30px_rgba(74,37,169,.5)] flex flex-col z-[15]">
        <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#F0E9FB]">
          <span className="id-badge bg-violet text-white" dir="ltr">{node.id}</span>
          <button onClick={onClose} className="w-7 h-7 bg-tile-v2 rounded-lg text-muted">×</button>
        </div>
        <div className="flex-1 overflow-auto p-[18px]">
          <div className="text-[12.5px] text-muted">
            {/* Edit branch — implemented in Tasks 13–15 */}
            <button onClick={props.onEdit} className="hidden" />
            {props.conflicts.map((c, i) => (
              <div key={i}>
                <button onClick={() => props.onAccept(c.index)} className="hidden" />
                <button onClick={() => props.onReject(c.index)} className="hidden" />
              </div>
            ))}
            {isActivity && a.subprocess && (
              <button onClick={() => props.onOpenSub(a.subprocess!)} className="hidden" />
            )}
            <button onClick={() => props.onPatch({})} className="hidden" />
            <button onClick={() => props.onLinkSub(null)} className="hidden" />
            <button onClick={() => props.onSetJunction(j.junctionType ?? 'XOR')} className="hidden" />
            <button onClick={props.onCreateSub} className="hidden" />
            {props.process.nodes.length >= 0 && null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-0 bottom-0 left-0 w-[340px] bg-white border-e border-warm shadow-[20px_0_50px_-30px_rgba(74,37,169,.5)] flex flex-col z-[15]">
      <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#F0E9FB]">
        <span className="id-badge bg-violet text-white" dir="ltr">{node.id}</span>
        <button onClick={onClose} className="w-7 h-7 bg-tile-v2 rounded-lg text-muted">×</button>
      </div>
      <div className="flex-1 overflow-auto p-[18px]">
        {node.type === 'junction' ? (
          <>
            <div className="font-extrabold text-[16px] text-ink">دروازهٔ منطقی {j.junctionType}</div>
            <div className="text-[12.5px] text-muted mt-2.5 leading-loose">XOR: فقط یکی از مسیرها فعال می‌شود. AND: همهٔ مسیرها هم‌زمان. OR: یک یا چند مسیر.</div>
          </>
        ) : isActivity ? (
          <>
            <div className="font-extrabold text-[16px] text-ink leading-tight">{a.label}</div>
            <div className="mt-3 px-3 py-2.5 bg-[#F8F4FE] rounded-[10px] text-[12.5px] text-violet font-semibold" aria-label={`مجری: ${a.actor}`}>
              {`مجری: ${a.actor}`}
            </div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-1.5">توضیحات</div>
            <div className="text-[12.5px] text-[#5a5175] leading-relaxed">{a.description}</div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-2">اطلاعات ICOM</div>
            <div className="flex flex-col gap-2.5">
              <IcomRow label="ورودی‌ها" items={a.icom.inputs} kind="input" />
              <IcomRow label="کنترل‌ها" items={a.icom.controls} kind="control" />
              <IcomRow label="خروجی‌ها" items={a.icom.outputs} kind="output" />
              <IcomRow label="مکانیزم‌ها" items={a.icom.mechanisms} kind="mech" />
            </div>
            <div className="text-[10.5px] text-[#c3bad6] mt-5 border-t border-dashed border-[#EDE5F5] pt-3" dir="ltr">source: {a.source.created_by}</div>
          </>
        ) : (
          <div className="font-extrabold text-[16px] text-ink">{'label' in node ? (node as { label: string }).label : (node as { id: string }).id}</div>
        )}
      </div>
    </div>
  )
}

function IcomRow({ label, items, kind }: { label: string; items: string[]; kind: 'input' | 'control' | 'output' | 'mech' }) {
  return (
    <div>
      <div className="text-[10.5px] text-faint mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <Chip key={i} kind={kind}>{t}</Chip>)}</div>
    </div>
  )
}
