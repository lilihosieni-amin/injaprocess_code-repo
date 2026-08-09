export interface TabItem { id: string; label: string }

export function Tabs({
  items, value, onChange,
}: { items: TabItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="inline-flex gap-1 p-1 rounded-control bg-tile-v2">
      {items.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`min-h-touch px-4 rounded-control text-caption font-bold border-0 cursor-pointer ${
              active ? 'bg-violet text-card' : 'bg-transparent text-muted hover:text-violet'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
