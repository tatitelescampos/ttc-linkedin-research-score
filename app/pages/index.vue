<script setup lang="ts">
const { data: health } = await useFetch('/api/health')
</script>

<template>
  <UMain>
    <UContainer class="py-10">
      <UPageHeader
        title="TTC LinkedIn Research Score"
        description="Base Nuxt com Nuxt UI, Drizzle e SQLite pronta para evoluir."
      />

      <UPageGrid class="mt-8">
        <UPageCard
          icon="i-lucide-database"
          title="SQLite conectado"
          :description="`Itens cadastrados: ${health?.researchItems ?? 0}`"
        />

        <UPageCard
          icon="i-simple-icons-nuxtdotjs"
          title="Nuxt UI instalado"
          description="Componentes e tema do Nuxt UI disponiveis no projeto."
        />

        <UPageCard
          icon="i-lucide-heart-pulse"
          title="Health endpoint"
          description="A rota /api/health valida a conexao com o banco."
          to="/api/health"
          target="_blank"
        />
      </UPageGrid>
    </UContainer>
  </UMain>
</template>
