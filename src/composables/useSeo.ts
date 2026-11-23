import { watch } from 'vue'
import { useI18n } from './useI18n'
import type { L } from '@/content'

/**
 * Keep the document head in step with the language switch.
 *
 * `index.html` ships the English head: title, description, Open Graph, Twitter
 * and the `en_US` locale. Reading the page in Chinese (`?lang=zh`, or a stored
 * choice) would otherwise leave a Chinese release announcing itself in English
 * to every crawler that renders JS — which is how Googlebot, and only Googlebot,
 * sees the page.
 *
 * So the same strings the app renders also go back into the head. The canonical
 * and `og:url` follow the URL, not the toggle: a reader who flips language
 * without the query keeps the root canonical, because that is the address a
 * crawler can actually fetch. `?lang=zh` is its own canonical.
 *
 * The static tags stay the source of truth for anything not listed here — the
 * citation block, the structured data and the social card are language-neutral
 * and are not rewritten.
 */
const META: Record<L, {
  title: string
  description: string
  social: string
  locale: string
  altLocale: string
}> = {
  en: {
    title: 'HumanCOIN: 12,500-Hour Egocentric Manipulation Dataset',
    description:
      'HumanCOIN is a 12,500-hour egocentric manipulation dataset with gaze, sEMG, EEG and glove kinematics: three tiers that make human intent observable.',
    social:
      'From visible action to hidden signals: 12,500 hours of first-person manipulation across 38 scene classes, recorded with gaze, surface EMG, EEG and glove kinematics.',
    locale: 'en_US',
    altLocale: 'zh_CN',
  },
  zh: {
    title: 'HumanCOIN：12,500 小时第一人称操作数据集',
    description:
      'HumanCOIN 收录 12,500 小时第一人称操作数据，覆盖 38 个场景类别，同步记录注视、表面肌电、脑电与手套运动学，让动作背后的意图可观测。',
    social:
      '从可见动作到隐藏信号：12,500 小时第一人称操作数据，覆盖 38 个场景类别，同步记录注视、表面肌电、脑电与手套运动学。',
    locale: 'zh_CN',
    altLocale: 'en_US',
  },
}

/** Set an attribute on the first element matching `selector`, if it exists. */
function setAttr(selector: string, name: string, value: string) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute(name, value)
}

function setMeta(key: string, value: string, attr: 'name' | 'property' = 'name') {
  setAttr(`meta[${attr}="${key}"]`, 'content', value)
}

/**
 * The address a crawler can fetch for the language currently on screen. Only
 * `lang` survives: the reading position lives in the hash, which is never part
 * of a canonical.
 */
function canonicalUrl(): string {
  const url = new URL(window.location.href)
  const zh = url.searchParams.get('lang') === 'zh'
  return `${url.origin}${url.pathname}${zh ? '?lang=zh' : ''}`
}

function apply(l: L) {
  if (typeof document === 'undefined') return
  const meta = META[l]
  document.title = meta.title
  setMeta('description', meta.description)
  setMeta('og:title', meta.title, 'property')
  setMeta('og:description', meta.social, 'property')
  setMeta('og:locale', meta.locale, 'property')
  setMeta('og:locale:alternate', meta.altLocale, 'property')
  setMeta('twitter:title', meta.title)
  setMeta('twitter:description', meta.social)

  const canonical = canonicalUrl()
  setAttr('link[rel="canonical"]', 'href', canonical)
  setMeta('og:url', canonical, 'property')
}

let started = false

function initSeo() {
  if (started || typeof document === 'undefined') return
  started = true
  const { lang } = useI18n()
  watch(lang, (l) => apply(l), { immediate: true })
}

export { initSeo }
