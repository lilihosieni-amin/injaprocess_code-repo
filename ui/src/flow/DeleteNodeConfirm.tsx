export function DeleteNodeConfirm({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-[70] p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[420px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="p-6 pb-5 text-center">
          <div className="font-extrabold text-[17px] text-ink mb-2">حذف «{label}»؟</div>
          <div className="text-[13px] text-muted leading-loose">این گره حذف می‌شود و گرهِ قبلی به گرهِ بعدی متصل می‌ماند تا مسیر نشکند. با «واگرد» قابل بازگردانی است.</div>
        </div>
        <div className="flex gap-2.5 px-[22px] pb-[22px]">
          <button onClick={onCancel} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl text-sm font-bold text-[#6B5CA5]">انصراف</button>
          <button onClick={onConfirm} className="flex-1 py-3 border-0 bg-conflict rounded-xl text-sm font-bold text-white">حذف کامل</button>
        </div>
      </div>
    </div>
  )
}
