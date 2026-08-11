import { DeniedState, NotFoundState } from '../ui/states'

/**
 * The full-screen form of the two refusal states, laid out like the screen it
 * replaces. Which one to show is decided by `refusalStatus` in `api/client`, so
 * the mapping from status to surface lives in exactly one place.
 */
export function RefusalScreen({ status }: { status: 403 | 404 }) {
  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[560px] mx-auto">
        {status === 404 ? <NotFoundState /> : <DeniedState />}
      </div>
    </div>
  )
}
