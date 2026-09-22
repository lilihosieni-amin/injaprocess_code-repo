/** Clipboard write for non-secure contexts, where navigator.clipboard is
 *  undefined (the app is reachable over plain http locally, and the modal must
 *  still copy there). Returns whether the copy actually happened, so the button
 *  never claims success the browser refused. */
export function copyViaTextarea(text: string): boolean {
  const t = document.createElement('textarea')
  t.value = text
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(t)
  return ok
}

/** Copy `text`, falling back to the textarea where navigator.clipboard is absent. */
export function copyText(text: string): boolean {
  const clipboard = navigator.clipboard
  if (clipboard?.writeText) {
    try {
      clipboard.writeText(text).catch(() => { copyViaTextarea(text) })
      return true
    } catch { /* fall through to the textarea */ }
  }
  return copyViaTextarea(text)
}
