import { createApp } from 'vue'
import App from './App.vue'
import { vReveal } from './composables/useReveal'
import { initTheme } from './composables/useTheme'
import { initSeo } from './composables/useSeo'
import './styles/tokens.css'
import './styles/base.css'
import './styles/dark.css'

initTheme()
initSeo()

createApp(App).directive('reveal', vReveal).mount('#app')
