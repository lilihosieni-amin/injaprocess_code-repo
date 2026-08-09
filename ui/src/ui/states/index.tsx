import { Button } from '../Button'
import { Card } from '../Card'

export function LoadingState({ rows = 3 }: { rows?: number }) {
  // F12 — skeletons shaped like the content, so nothing shifts when data lands.
  return (
    <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row"
          className="h-16 rounded-card bg-tile-v2 animate-pulse" />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">{title}</p>
      {hint && <p className="text-body text-muted mt-2 mb-0">{hint}</p>}
    </Card>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="violet" onClick={onRetry}>تلاش دوباره</Button>
        </div>
      )}
    </Card>
  )
}

export function DeniedState() {
  // F13 — for a refused *action* on something the user can see. Everything
  // out of scope is a 404 and renders NotFoundState instead.
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">اجازهٔ این کار را ندارید</p>
      <p className="text-body text-muted mt-2 mb-0">اگر فکر می‌کنید اشتباهی رخ داده، با سرپرست خود صحبت کنید.</p>
    </Card>
  )
}

export function NotFoundState() {
  // F13 — deliberately indistinguishable from a typo. No copy may hint that
  // something exists here and is being withheld; the UI cannot know, and saying
  // it would answer the question the 404 exists to refuse.
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">چیزی اینجا نیست</p>
      <p className="text-body text-muted mt-2 mb-0">نشانی را بررسی کنید یا به خانه برگردید.</p>
    </Card>
  )
}
