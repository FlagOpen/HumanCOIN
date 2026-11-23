<script setup lang="ts">
/**
 * The page's closing matter: licence, data statement, contact.
 *
 * The citation that used to open this footer now closes chapter 08, under the
 * wall it credits; what is left here is the legal and contact record, plus the
 * way back to the top.
 */
import { FOOTER, CITATION, SITE, UI } from '@/content'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const year = new Date().getFullYear()

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <footer class="foot">
    <div class="shell foot__inner">
      <div class="foot__brand">
        <p class="foot__mark mono">{{ SITE.name }}</p>
      </div>

      <div class="foot__cols">
        <section id="license">
          <h3 class="foot__h">{{ t(FOOTER.licenseTitle) }}</h3>
          <p class="foot__p">{{ t(FOOTER.licenseBody) }}</p>
          <p class="foot__p foot__p--strong">CC BY-NC 4.0</p>
        </section>

        <section>
          <h3 class="foot__h">{{ t(FOOTER.consentTitle) }}</h3>
          <p class="foot__p">{{ t(FOOTER.consentBody) }}</p>
        </section>

        <section>
          <h3 class="foot__h">{{ t(FOOTER.contactTitle) }}</h3>
          <p class="foot__p">{{ t(FOOTER.contactBody) }}</p>
          <p class="foot__p"><a href="mailto:gcyao1@baai.ac.cn">gcyao1@baai.ac.cn</a></p>
          <p class="foot__p"><a href="mailto:shihan.wu.koorye@outlook.com">shihan.wu.koorye@outlook.com</a></p>
        </section>
      </div>

      <div class="foot__base">
        <p>{{ t(FOOTER.rights) }} © {{ year }} {{ SITE.name }}</p>
        <div class="foot__baseend">
          <a
            class="foot__learn"
            :href="CITATION.url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t(FOOTER.learnMoreAria)"
          >{{ t(FOOTER.learnMore) }}<span aria-hidden="true">↗</span></a>
          <button class="foot__top" type="button" @click="toTop">{{ t(UI.toTop) }} ↑</button>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.mono { font-family: var(--ff-mono); }

.foot {
  border-top: 1px solid var(--line);
  background: var(--surface);
  padding-block: clamp(2.25rem, 1.75rem + 2.5vw, 3.5rem) 1.5rem;
}
.foot__inner { display: grid; gap: clamp(1.4rem, 1.1rem + 1.4vw, 2rem); }

.foot__mark { font-size: var(--fs-h4); font-weight: 660; color: var(--ink); margin: 0 0 0.3rem; letter-spacing: -0.02em; }

/* ---- citation: a single full-width row ---- */


.foot__cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1.25rem, 1rem + 1.5vw, 2.25rem);
}
@media (max-width: 860px) { .foot__cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .foot__cols { grid-template-columns: minmax(0, 1fr); } }

.foot__h {
  font-family: var(--ff-mono);
  font-size: var(--fs-micro);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 0.6rem;
  font-weight: 600;
}
.foot__p { font-size: var(--fs-micro); line-height: 1.7; color: var(--ink-soft); margin: 0 0 0.5rem; }
.foot__p--strong { color: var(--ink); font-weight: 600; font-family: var(--ff-mono); }
.foot__base {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--line);
}
.foot__base p { font-size: var(--fs-micro); color: var(--ink-mute); margin: 0; }
.foot__baseend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1.15rem;
}
.foot__learn {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25em;
  font-size: var(--fs-small);
  line-height: 1.4;
  white-space: nowrap;
}
.foot__learn span { font-size: 0.88em; }
.foot__top {
  border: 1px solid var(--line-strong);
  background: var(--paper);
  color: var(--ink-soft);
  font: inherit;
  font-size: var(--fs-micro);
  padding: 0.35rem 0.7rem;
  border-radius: var(--r-xs);
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.foot__top:hover { color: var(--ink); border-color: var(--ink-mute); }
</style>
