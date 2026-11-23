<script setup lang="ts">
/**
 * Chapter 09 — the citation.
 *
 * The record used to close the community chapter; the wall and the entry are
 * different things, so they now stand as two sections with two numbers and two
 * contents lines. Nothing else changes: the section head carries the title and
 * the licence terms, the block below carries the BibTeX and the copy control.
 */
import SectionHead from '@/components/SectionHead.vue'
import CiteBlock from '@/components/CiteBlock.vue'
import { CITE } from '@/content'
</script>

<template>
  <section id="cite" class="section">
    <div class="shell">
      <SectionHead
        :num="CITE.num"
        :kicker="CITE.kicker"
        :title="CITE.title"
        :aside="CITE.aside"
      />

      <CiteBlock />
    </div>
  </section>
</template>
