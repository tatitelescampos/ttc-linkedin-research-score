<script setup lang="ts">
type VacancyVersion = {
  id: number
  versionNumber: number
  sourceType: string
  originalText: string
  reviewedText: string
  createdAt: string
}

type VacancyDetail = {
  id: number
  title: string
  company: string
  location: string
  sourceUrl: string | null
  seniority: string | null
  sourcingComment: string | null
  createdAt: string
  currentVersion: VacancyVersion | null
  versions: VacancyVersion[]
}

const route = useRoute()
const { data: vacancy, pending, error } = await useFetch<VacancyDetail>(`/api/vacancies/${route.params.id}`)
</script>

<template>
  <UContainer class="py-8 sm:py-10">
    <UButton
      to="/"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="mb-6"
    >
      Voltar para vagas
    </UButton>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Vaga nao encontrada"
      description="Nao foi possivel carregar esta vaga."
    />

    <div
      v-else-if="pending"
      class="py-16 text-center text-sm text-muted"
    >
      Carregando vaga...
    </div>

    <div
      v-else-if="vacancy"
      class="space-y-6"
    >
      <div class="border-b border-default pb-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            color="primary"
            variant="solid"
            icon="i-lucide-briefcase-business"
            class="text-inverted"
          >
            Vaga
          </UBadge>
          <UBadge
            v-if="vacancy.seniority"
            color="neutral"
            variant="subtle"
          >
            {{ vacancy.seniority }}
          </UBadge>
        </div>

        <h1 class="mt-4 text-3xl font-bold leading-tight text-highlighted sm:text-4xl">
          {{ vacancy.title }}
        </h1>
        <p class="mt-2 text-base text-muted">
          {{ vacancy.company }} � {{ vacancy.location }}
        </p>

        <div class="mt-4 flex flex-wrap gap-3">
          <UButton
            v-if="vacancy.sourceUrl"
            :to="vacancy.sourceUrl"
            target="_blank"
            icon="i-lucide-external-link"
            color="neutral"
            variant="subtle"
          >
            Abrir origem
          </UButton>
          <UBadge
            color="success"
            variant="subtle"
          >
            {{ vacancy.versions.length }} versao inicial preservada
          </UBadge>
        </div>
      </div>

      <UCard v-if="vacancy.sourcingComment">
        <template #header>
          <span class="text-sm font-semibold text-highlighted">Comentario de sourcing</span>
        </template>
        <p class="text-sm leading-6 text-toned">
          {{ vacancy.sourcingComment }}
        </p>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm font-semibold text-highlighted">Descricao original revisada</span>
            <UBadge
              color="primary"
              variant="subtle"
            >
              Versao {{ vacancy.currentVersion?.versionNumber ?? 1 }} � imutavel
            </UBadge>
          </div>
        </template>

        <pre class="max-h-[720px] overflow-auto whitespace-pre-wrap rounded-lg bg-elevated p-4 text-sm leading-6 text-toned"><code>{{ vacancy.currentVersion?.reviewedText }}</code></pre>
      </UCard>
    </div>
  </UContainer>
</template>
