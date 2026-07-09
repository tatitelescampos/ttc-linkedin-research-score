<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'pt-BR' },
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})

useSeoMeta({
  title: 'TTC LinkedIn Research Score',
  description: 'Nuxt, Nuxt UI, Drizzle e SQLite prontos para pesquisa e pontuacao.'
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
