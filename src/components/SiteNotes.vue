<script setup lang="ts">
/**
 * The notes column — the right-hand counterpart of the contents rail.
 *
 * The article is centred, so at wide viewports the contents take the left
 * gutter and the right one stayed empty. This rail spends that gutter on the
 * article's own vocabulary: two or three terms the section in view has just
 * used, each with one sentence that explains it and stops. It follows the
 * section rather than the scroll position, so it never reads as a widget: no
 * card, no fill, no rule beyond the hairline under its heading — type only, at
 * caption scale, so the body copy keeps the weight.
 */
import { computed } from 'vue'
import { NAV, NOTES, UI } from '@/content'
import { useI18n } from '@/composables/useI18n'
import { READING_PROBE, useScrollSpy } from '@/composables/useScrollSpy'
import { useHeroVisible } from '@/composables/useHeroVisible'

const { t } = useI18n()

const heroVisible = useHeroVisible()

/* Only the sections, not their sub-blocks: the notes belong to the whole
   section, so the rail must not flicker while the reader moves through
   `data-tiers` → `data-scenes`. The probe sits inside the reading area rather
   than under the masthead, so a section is glossed while it is being read — and
   the closing blocks, which never reach the masthead, still get their turn. */
const ids = NAV.map((n) => n.id)
const { active } = useScrollSpy(ids, READING_PROBE)

const section = computed(() => NAV.find((n) => n.id === active.value) ?? NAV[0])
const notes = computed(() => NOTES[active.value] ?? [])
</script>

<template>
  <aside
    class="notes"
    :data-hidden="heroVisible ? 'true' : 'false'"
    :aria-label="t(UI.notesAria)"
  >
    <p class="notes__label">{{ t(UI.notes) }}</p>
    <p class="notes__ctx mono">
      <span v-if="section.num" class="notes__num">{{ section.num }}</span>{{ t(section.label) }}
    </p>
    <!-- Re-keyed on the section, so a swap remounts the list and replays the
         fade. A Transition would hold the rail blank while it swapped out and
         in; remounting keeps the old notes until the new ones start. -->
    <dl :key="active" class="notes__list">
      <div v-for="note in notes" :key="note.term.en" class="notes__item">
        <dt class="notes__term">{{ t(note.term) }}</dt>
        <dd class="notes__gloss">{{ t(note.gloss) }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.mono { font-family: var(--ff-mono); }

.notes {
  position: fixed;
  /* Mirrored from the contents rail: same distance from the article's edge, so
     the two gutters read as one frame around the page. */
  right: max(1.25rem, calc(50% - var(--article-w) / 2 - var(--toc-w) - var(--toc-gap)));
  top: calc(var(--nav-h) + 2.8rem);
  width: var(--toc-w);
  z-index: 40;
  transition: opacity var(--dur-3) var(--ease), transform var(--dur-3) var(--ease);
}
.notes[data-hidden='true'] {
  opacity: 0;
  transform: translateY(-0.4rem);
  pointer-events: none;
}

.notes__label {
  margin: 0 0 1rem;
  font-size: 0.72rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

/* The section the notes belong to, so the rail always says what it is glossing. */
.notes__ctx {
  display: flex;
  align-items: baseline;
  gap: 0.45em;
  margin: 0;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-tick);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.notes__num { color: var(--ink-mute); }

.notes__list {
  margin: 0.85rem 0 0;
  /* Plays on every mount, which is every section change. */
  animation: notes-in var(--dur-2) var(--ease) both;
}
@keyframes notes-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
.notes__item + .notes__item { margin-top: 0.85rem; }
.notes__term {
  margin: 0 0 0.16rem;
  font-size: var(--fs-micro);
  font-weight: 620;
  letter-spacing: -0.005em;
  line-height: 1.4;
  color: var(--ink);
}
.notes__gloss {
  margin: 0;
  font-size: var(--fs-micro);
  line-height: 1.55;
  color: var(--ink-soft);
  text-wrap: pretty;
}

/* Same breakpoint as the contents: below it the article takes the width back. */
@media (max-width: 1359px) {
  .notes { display: none; }
}
</style>
