import { useSurface } from '../ui/surface'
import { ReaderInbox } from './ReaderInbox'

/** `/comments`. The panel's inbox (Task 13) joins here on the panel surface. */
export function CommentsScreen() {
  return useSurface() === 'reader' ? <ReaderInbox /> : null
}
