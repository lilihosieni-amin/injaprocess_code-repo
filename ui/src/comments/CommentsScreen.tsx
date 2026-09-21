import { useSurface } from '../ui/surface'
import { PanelInbox } from './PanelInbox'
import { ReaderInbox } from './ReaderInbox'

/** `/comments` — each surface's own inbox. */
export function CommentsScreen() {
  return useSurface() === 'reader' ? <ReaderInbox /> : <PanelInbox />
}
