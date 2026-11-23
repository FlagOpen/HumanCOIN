import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * True while the cover still holds most of the viewport.
 *
 * Both side rails — the contents on the left, the notes on the right — stay out
 * of the way over the title page, which is not part of the article yet, and
 * hand over together once it has been scrolled more than half past. Sharing one
 * probe keeps the two rails from disagreeing about when the page begins.
 */
export function useHeroVisible() {
  const heroVisible = ref(true)
  let io: IntersectionObserver | null = null

  onMounted(() => {
    const hero = document.getElementById('top')
    if (!hero || typeof IntersectionObserver === 'undefined') return
    io = new IntersectionObserver(
      ([entry]) => { heroVisible.value = entry.intersectionRatio > 0.5 },
      { threshold: [0, 0.5, 1] },
    )
    io.observe(hero)
  })

  onBeforeUnmount(() => {
    io?.disconnect()
    io = null
  })

  return heroVisible
}
