import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Where the notes rail reads the page: a probe at 35% of the viewport.
 *
 * The masthead probe (`nav + 90px`) cannot see the footer at all — at the
 * maximum scroll the citation still starts below it — so a contents list driven
 * by it keeps the last body section highlighted while the reader is in the
 * footer. A probe inside the reading area reaches the closing blocks, and it
 * describes the section being read rather than the last heading that passed.
 * 35% rather than 50% keeps short sections (the install band, the release
 * figure) current when their heading is jumped to at the top of the view.
 */
export const READING_PROBE = 0.35

/**
 * Tracks which section is currently in view so the navigation can highlight it,
 * and reports overall reading progress for the thin bar under the header.
 *
 * `probeAt` moves the probe from just under the masthead to a fraction of the
 * viewport height; the contents rail keeps the default because its sub-entries
 * are only a few hundred pixels apart, while the notes rail passes
 * `READING_PROBE` so it describes the section being read.
 */
export function useScrollSpy(ids: readonly string[], probeAt?: number) {
  const active = ref<string>(ids[0] ?? '')
  const progress = ref(0)
  const atTop = ref(true)
  let ticking = false

  function measure() {
    ticking = false
    const navH = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h'),
    ) || 60
    const probe = probeAt === undefined
      ? window.scrollY + navH + 90
      : window.scrollY + Math.max(navH + 90, window.innerHeight * probeAt)

    let current = ids[0] ?? ''
    for (const id of ids) {
      const el = document.getElementById(id)
      if (!el) continue
      const top = el.getBoundingClientRect().top + window.scrollY
      if (top <= probe) current = id
    }
    active.value = current

    const doc = document.documentElement
    const max = doc.scrollHeight - window.innerHeight
    progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    atTop.value = window.scrollY < 12
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(measure)
  }

  onMounted(() => {
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })

  return { active, progress, atTop }
}
