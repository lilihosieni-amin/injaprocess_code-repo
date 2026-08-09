import { useId } from 'react'

export function SearchField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {/* F11 — bound label. The mockups use placeholders alone, which vanish on
          focus and are not announced as names. */}
      <label htmlFor={id} className="text-caption font-bold text-muted">{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-touch w-full px-4 rounded-control border border-line bg-card text-body text-ink"
      />
    </div>
  )
}
