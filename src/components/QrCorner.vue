<script setup lang="ts">
/**
 * The corner code.
 *
 * The release's WeCom group code, parked in the bottom-right corner: a
 * thumbnail while a reader is reading, the scannable card on hover — or on
 * keyboard focus, or on a tap, since touch screens have no hover.
 *
 * The card keeps its own white ground in both themes. A QR needs the contrast;
 * tinting it to the page's paper would break the scan.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const QR_SRC = 'qr/wecom-group.png'

const root = ref<HTMLElement | null>(null)
const open = ref(false)

/** Touch screens have no hover, so there the card opens and closes on tap. */
const canHover =
  typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

function toggle() {
  if (canHover) return
  open.value = !open.value
}

function onOutside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="qr" :class="{ 'qr--open': open }">
    <button
      class="qr__card"
      type="button"
      :aria-expanded="open"
      :aria-label="t({
        en: 'WeCom group code — hover or tap to enlarge',
        zh: '企业微信群二维码，悬停或点击放大',
      })"
      @click="toggle"
    >
      <img class="qr__img" :src="QR_SRC" width="396" height="396" alt="企业微信群二维码" />
      <span class="qr__cap">{{ t({ en: 'Scan with WeCom to join the group', zh: '企业微信扫码入群' }) }}</span>
    </button>
  </div>
</template>

<style scoped>
.qr {
  position: fixed;
  right: clamp(0.75rem, 1.2vw, 1.5rem);
  bottom: clamp(0.75rem, 1.2vw, 1.5rem);
  /* above the notes rail (40), below the masthead (60) */
  z-index: 45;
}

.qr__card {
  display: block;
  width: 84px;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: var(--e-2);
  cursor: pointer;
  text-align: center;
  transition: width var(--dur-3) var(--ease), padding var(--dur-3) var(--ease),
    box-shadow var(--dur-3) var(--ease);
}
.qr__card:hover { box-shadow: var(--e-3); }

.qr__img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

/* The caption lives on the white card, so its colour is fixed rather than
   taken from the theme tokens — the dark theme's ink would vanish here. */
.qr__cap {
  display: block;
  max-height: 0;
  margin-top: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 0.72rem;
  font-weight: 550;
  line-height: 1.35;
  color: #43525e;
  transition: max-height var(--dur-3) var(--ease), margin-top var(--dur-3) var(--ease),
    opacity var(--dur-2) var(--ease);
}

.qr:hover .qr__card,
.qr__card:focus-visible,
.qr--open .qr__card {
  width: 200px;
  padding: 10px;
}
.qr:hover .qr__cap,
.qr__card:focus-visible .qr__cap,
.qr--open .qr__cap {
  max-height: 4em;
  margin-top: 8px;
  opacity: 1;
}

@media (max-width: 560px) {
  .qr__card { width: 68px; padding: 6px; border-radius: 12px; }
  .qr:hover .qr__card,
  .qr__card:focus-visible,
  .qr--open .qr__card { width: 168px; padding: 9px; }
}

@media (prefers-reduced-motion: reduce) {
  .qr__card,
  .qr__cap { transition: none; }
}

@media print {
  .qr { display: none; }
}
</style>
