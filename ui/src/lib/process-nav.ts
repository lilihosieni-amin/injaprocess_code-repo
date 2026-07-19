import type { Process } from '../api/types'

/**
 * The next (dir = 1) or previous (dir = -1) process to navigate to from
 * `currentId`, within `list` (department order). Wraps around the ends and
 * skips tombstoned processes. Never returns the current process. Returns null
 * when no other active process exists or `currentId` isn't in the list.
 */
export function neighborProcess(list: Process[], currentId: string, dir: 1 | -1): Process | null {
  const n = list.length
  const i = list.findIndex((p) => p.id === currentId)
  if (i < 0) return null
  for (let k = 1; k < n; k++) {
    const cand = list[(((i + dir * k) % n) + n) % n]
    if (!cand.tombstoned) return cand
  }
  return null
}
