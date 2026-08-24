import { useEffect, type RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Where each history entry was scrolled to, by `location.key`.
 *
 * A module-level `Map` and not `sessionStorage`, because the key it is keyed on
 * does not survive a reload: React Router mints fresh keys for a fresh history
 * stack, so a persisted entry could never be matched again and would only
 * accumulate. Per-session and tiny — one number per screen the person visited.
 */
const SAVED = new Map<string, number>()

/**
 * How long after a navigation this keeps trying to reach the saved offset.
 *
 * The content is not there when the screen mounts: every screen reads its data
 * through react-query, so the scroll box is a few hundred pixels tall for a
 * frame or two and `scrollTop = 900` clamps to whatever fits. There is no event
 * for "the screen is as tall as it is going to get", so the offset is re-applied
 * each frame until it sticks or this runs out. Generous enough for a cold
 * request on a phone, short enough that it cannot fight a person who has started
 * reading.
 */
const RESTORE_MS = 1200

/**
 * The same window for a NEW entry, which asserts the top rather than an offset.
 *
 * Shorter, because it is holding the box at zero and a person who scrolls the
 * moment a screen opens must win — they do anyway, the moment they touch it, but
 * the window is the floor under that promise.
 */
const RESET_MS = 600

/**
 * **The back button returns to where you were** — owner ruling: *"when you go
 * back to the parent process using the back button, it should be displayed from
 * the same scroll position it was at before — not from the top of the page. In
 * general, the back button should always and everywhere return to the same
 * scroll position it was at, no matter where in the app it's used."*
 *
 * ## Why this is not the browser's job here
 *
 * Nothing in this app scrolls the window. Every screen is a `flex-1
 * overflow-auto` box inside `main`, which is how the chrome stays put while the
 * content moves — so the browser's own scroll restoration, which only ever
 * restores the document, has nothing to restore and React Router v6 does not
 * restore anything at all. The position lived nowhere.
 *
 * ## Why it belongs to the shell
 *
 * One implementation instead of nine. The scroller is `main`'s only element
 * child on every route — the screen root itself — so the shell can reach it
 * without each screen opting in, and a screen added later inherits the
 * behaviour rather than forgetting it. `ProcessList` had grown its own copy
 * (`sessionStorage`, keyed by department) and it is deleted with this: keyed by
 * department it restored the same offset whichever way you arrived, including
 * on a fresh visit from the department list, and it had no idea what "back"
 * meant.
 *
 * ## PUSH scrolls to the top, and that is the other half of the ruling
 *
 * *"when a report enters a sub-process, that sub-process should be displayed
 * starting from the top of the page."* Entering a sub-process from the step view
 * is `/processes/a/steps` → `/processes/b/steps`: the same route, so React keeps
 * the same component and the same DOM node, and the scroll offset of the parent
 * simply stays — the child opened halfway down itself. A new history entry is
 * always the top of a page, so PUSH and REPLACE assert 0 rather than assuming a
 * fresh element.
 *
 * **And asserting it ONCE is not enough.** Traced frame by frame, the offset
 * went `543/1188` → `0/645` → `326/971`: the child's placeholder empties the
 * container, the browser clamps 543 to 0, this effect writes its own 0 into a
 * box that is already at 0 — and the instant the child's content lands the
 * browser puts the offset back, at the new maximum. The box remembers what it
 * was ASKED to be scrolled to, a clamp is not an answer to that question, and an
 * assignment of the value it already holds does not withdraw it.
 *
 * Not scroll anchoring, which was the obvious suspect and was measured and
 * cleared: `overflow-anchor: none` on this very box left the trace byte for
 * byte unchanged.
 *
 * So the reset runs on the same bounded loop the restore does, and both stop on
 * the same condition — the box has CONTENT and the offset is where it should be.
 * That is what "the screen has finished arriving" means here, and it is why a
 * fixed number of frames would have been a guess.
 *
 * ## What stops it fighting the reader
 *
 * The restore loop gives up the moment the offset sticks, when `RESTORE_MS` runs
 * out, or when a `wheel`, `touchstart` or `keydown` says somebody is already
 * reading — whichever comes first. After that the same effect only saves.
 */
export function useScrollMemory(main: RefObject<HTMLElement | null>) {
  const { key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    const host = main.current
    if (host === null) return

    // Re-read on every frame rather than captured once: a screen that renders a
    // placeholder while its query is in flight replaces this element when the
    // data lands, and a captured reference would be scrolling a detached node.
    const scroller = () => host.firstElementChild as HTMLElement | null

    const want = navigationType === 'POP' ? SAVED.get(key) ?? 0 : 0
    // True for a reset as well as a restore: both hold the box against the
    // browser until its content is there, and `save` must not record what this
    // loop writes in the meantime.
    let restoring = true
    let raf = 0

    function save() {
      const el = scroller()
      // Not while restoring: the scroll events this very loop causes would
      // otherwise write the clamped offset back over the target and the memory
      // would converge on zero.
      if (el !== null && !restoring) SAVED.set(key, el.scrollTop)
    }

    function stop() {
      restoring = false
      cancelAnimationFrame(raf)
    }

    function step() {
      const el = scroller()
      if (el !== null) {
        el.scrollTop = want
        // **Settled means the box has content AND is where it should be.** The
        // second half alone is trivially true of a reset — the placeholder is
        // already at 0 — and stopping there is exactly the bug: the browser
        // re-applies the offset it was last asked for when the content returns.
        const arrived = el.scrollHeight > el.clientHeight
        if (arrived && Math.abs(el.scrollTop - want) < 1) { stop(); return }
      }
      raf = requestAnimationFrame(step)
    }

    step()
    const deadline = setTimeout(stop, restoring ? RESTORE_MS : RESET_MS)
    // Four ways a person starts scrolling, and every one of them ends the loop
    // before it can fight them: the wheel, a finger, the keyboard, and
    // `mousedown` — which is the scrollbar being dragged, the one gesture the
    // other three miss.
    host.addEventListener('wheel', stop, { passive: true })
    host.addEventListener('touchstart', stop, { passive: true })
    host.addEventListener('keydown', stop)
    host.addEventListener('mousedown', stop)
    // `capture`, because the scroller is a descendant and `scroll` does not
    // bubble: listened for on `main` in the bubble phase it would never fire.
    host.addEventListener('scroll', save, { capture: true, passive: true })
    return () => {
      clearTimeout(deadline)
      stop()
      host.removeEventListener('wheel', stop)
      host.removeEventListener('touchstart', stop)
      host.removeEventListener('keydown', stop)
      host.removeEventListener('mousedown', stop)
      host.removeEventListener('scroll', save, { capture: true })
    }
  }, [key, navigationType, main])
}
