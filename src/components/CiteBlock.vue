<script setup lang="ts">
/**
 * The citation entry — the body of chapter 09.
 *
 * It used to open the footer, then closed the community chapter; it now has its
 * own section, so the block carries only a mono label and the copy control — the
 * section head carries the title. The entry stays one pre so its hanging indent
 * survives: the author list runs to dozens of names and would otherwise scroll
 * sideways.
 */
import { onBeforeUnmount, ref } from 'vue'
import { AUTHORS, CITATION, CITE, UI } from '@/content'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

/**
 * Built in script so the template never has to escape BibTeX braces.
 *
 * The entry is the `@article` form: arXiv id in the journal field, fields in
 * the order they are pasted, and every author written out.
 */

/** `Shihan Wu` → `Wu, Shihan`, the surname-first form a BibTeX person wants. */
function bibName(full: string): string {
  const parts = full.trim().split(/\s+/)
  const surname = parts.pop() ?? full
  return parts.length ? `${surname}, ${parts.join(' ')}` : surname
}

/**
 * The author field, wrapped. Line breaks fall only between names, so a surname
 * and its given name never part; the break stands in for the space after `and`,
 * which BibTeX ignores anyway, and the field hangs under its own indent instead
 * of scrolling sideways.
 */
function authorField(names: readonly string[], width = 96): string[] {
  const head = '  author={'
  const hang = ' '.repeat(head.length)
  const lines: string[] = []
  let cur = ''
  for (const name of names) {
    const base = lines.length === 0 ? head : hang
    const add = cur ? ` and ${name}` : name
    if (cur && base.length + cur.length + add.length > width) {
      lines.push(`${base}${cur} and`)
      cur = name
    } else {
      cur += add
    }
  }
  lines.push(`${lines.length === 0 ? head : hang}${cur}},`)
  return lines
}

const bibtex = [
  `@${CITATION.type}{${CITATION.key},`,
  `  title={${CITATION.title}},`,
  ...authorField(AUTHORS.map(bibName)),
  `  journal={arXiv preprint arXiv:${CITATION.eprint}},`,
  `  year={${CITATION.year}}`,
  '}',
].join('\n')

/* Copy the entry as plain text. `navigator.clipboard` needs a secure context,
 * so a selection-based fallback runs where it is missing — a viewer opened over
 * plain http is common enough that a dead button would be the normal case. */
const copyState = ref<'idle' | 'done' | 'failed'>('idle')
let resetTimer = 0

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(area)
  return ok
}

async function copyBibtex() {
  let ok = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(bibtex)
      ok = true
    } else {
      ok = legacyCopy(bibtex)
    }
  } catch {
    ok = legacyCopy(bibtex)
  }
  copyState.value = ok ? 'done' : 'failed'
  clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => (copyState.value = 'idle'), 2000)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<template>
  <div class="cite">
    <div class="cite__head">
      <p class="cite__label mono">{{ t(CITE.label) }}</p>
      <button
        class="cite__copy"
        type="button"
        :class="`is-${copyState}`"
        :aria-label="t(UI.copyBibtex)"
        @click="copyBibtex"
      >
        {{ copyState === 'done' ? t(UI.copied) : copyState === 'failed' ? t(UI.copyFailed) : t(UI.copy) }}
      </button>
    </div>
    <pre class="cite__code">{{ bibtex }}</pre>
  </div>
</template>

<style scoped>
.cite__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}
.cite__label {
  margin: 0;
  font-size: var(--fs-tick);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.cite__copy {
  font: inherit;
  font-family: var(--ff-mono);
  font-size: var(--fs-tick);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-xs);
  padding: 0.22rem 0.55rem;
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.cite__copy:hover { color: var(--ink); border-color: var(--ink-mute); }
.cite__copy.is-done { color: var(--c-teal); border-color: var(--c-teal); }
.cite__copy.is-failed { color: var(--c-amber); border-color: var(--c-amber); }

.cite__code {
  margin: 0;
  padding: 0.8rem 0.9rem;
  background: var(--paper);
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-size: var(--fs-micro);
  line-height: 1.7;
  color: var(--ink-body);
  white-space: pre-wrap;
  /* Break only when a single token is wider than the line; `anywhere` was
     splitting ordinary words mid-way and reading as broken text. */
  overflow-wrap: break-word;
  word-break: normal;
}
</style>
