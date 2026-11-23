<script setup lang="ts">
/**
 * Chapter 07 — the release, and the start.
 *
 * Two blocks that used to be two chapters: the release figure, which shows one
 * synchronised moment per tier, and the install band, which is how a reader
 * gets the rest. They share one number, one contents entry and one set of
 * margin notes; the band keeps its own heading underneath, so it still reads as
 * the closing action rather than as a second section.
 */
import SectionHead from '@/components/SectionHead.vue'
import CoverFigure from '@/components/CoverFigure.vue'
import InstallSection from '@/sections/InstallSection.vue'
import { RELEASE } from '@/content'
</script>

<template>
  <section id="release" class="section">
    <div class="shell release__head">
      <SectionHead
        :num="RELEASE.num"
        :kicker="RELEASE.kicker"
        :title="RELEASE.title"
        :aside="RELEASE.aside"
      />

      <CoverFigure />
    </div>

    <!-- The chapter's closing block: the client that opens the release. -->
    <InstallSection />
  </section>
</template>

<style scoped>
.release__head {
  /* The band below draws its own top rule, so the figure does not need to pay
     for one at the bottom of the shell. */
  padding-bottom: 0.25rem;
}
</style>
