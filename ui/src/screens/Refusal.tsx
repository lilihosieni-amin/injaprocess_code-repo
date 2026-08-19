import { DeniedState, NotFoundState } from '../ui/states'

/**
 * The full-screen form of the two refusal states, laid out like the screen it
 * replaces. Which one to show is decided by `refusalStatus` in `api/client`, so
 * the mapping from status to surface lives in exactly one place.
 *
 * **Reachable only by typing a URL** (R5). No route resolves here and no control
 * in the app navigates here; every caller renders it from a status the server
 * gave. It carries no control of its own for the same reason — an affordance on
 * a refusal surface is a second chance to be refused.
 */
export function RefusalScreen({ status }: { status: 403 | 404 }) {
  return (
    <div data-screen="refusal" className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-list mx-auto">
        {status === 404 ? <NotFoundState /> : <DeniedState />}
      </div>
    </div>
  )
}
