<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import SiteNav from '@/components/SiteNav.vue'
import SiteToc from '@/components/SiteToc.vue'
import SiteNotes from '@/components/SiteNotes.vue'
import QrCorner from '@/components/QrCorner.vue'
import HeroSection from '@/sections/HeroSection.vue'
import OverviewSection from '@/sections/OverviewSection.vue'
import SiteFooter from '@/sections/SiteFooter.vue'
import AnnotationSection from '@/sections/AnnotationSection.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

/** Below-the-fold and heavy sections load on demand. */
const AbstractSection = defineAsyncComponent(() => import('@/sections/AbstractSection.vue'))
const AcquisitionSection = defineAsyncComponent(() => import('@/sections/AcquisitionSection.vue'))
const DataSection = defineAsyncComponent(() => import('@/sections/DataSection.vue'))
// Research section is parked for now: the component stays in the tree, the
// page does not render it. Reinstate this line and the <ResearchSection /> tag
// below to bring it back; the numbers in `content.ts` are the live order.
// const ResearchSection = defineAsyncComponent(() => import('@/sections/ResearchSection.vue'))
const FormatSection = defineAsyncComponent(() => import('@/sections/FormatSection.vue'))
const PipelineSection = defineAsyncComponent(() => import('@/sections/PipelineSection.vue'))
const CommunitySection = defineAsyncComponent(() => import('@/sections/CommunitySection.vue'))
const CiteSection = defineAsyncComponent(() => import('@/sections/CiteSection.vue'))
const ReleaseSection = defineAsyncComponent(() => import('@/sections/ReleaseSection.vue'))
</script>

<template>
  <a class="skip-link" href="#main">{{ t({ en: 'Skip to content', zh: '跳到正文' }) }}</a>
  <SiteNav />
  <SiteToc />
  <SiteNotes />
  <QrCorner />

  <main id="main">
    <HeroSection />
    <AbstractSection />
    <OverviewSection />
    <DataSection />
    <AnnotationSection />
    <AcquisitionSection />
    <!-- <ResearchSection /> -->
    <FormatSection />
    <PipelineSection />
    <!-- 07: the release figure and, under it, the install band -->
    <ReleaseSection />
    <!-- 08: the collaborator wall -->
    <CommunitySection />
    <!-- 09: the citation, on its own -->
    <CiteSection />
  </main>

  <SiteFooter />
</template>
