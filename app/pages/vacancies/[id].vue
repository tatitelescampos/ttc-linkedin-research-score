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

type Requirement = {
  id?: number
  category: string
  label: string
  normalizedLabel: string
  provenance: string
  weight: number
  isMandatory: boolean
  isEliminatory: boolean
}

type AnalysisRun = {
  id: number
  source: 'mock' | 'openrouter'
  status: 'success' | 'error'
  model: string | null
  costUsd: string | null
  errorMessage: string | null
  createdAt: string
}

type SourcingQuery = {
  id: number
  vacancyId: number
  analysisId: number
  status: 'draft' | 'approved'
  versionNumber: number | null
  queryText: string
  providerFilters: Record<string, string[]>
  explanation: string
  assumptions: string[]
  limitations: string[]
  approvedAt: string | null
  canSelectForRun: boolean
}

type SourcingQueryPlan = {
  draft: SourcingQuery | null
  approvedVersions: SourcingQuery[]
}

type SourcingRun = {
  id: number
  vacancyId: number
  sourcingQueryId: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  mode: 'mock'
  config: {
    desiredResults: number
    threshold: number
    profileLimit: number
    pageLimit: number
    batchSize: number
    cacheAgeDays: number
  }
  progress: number
  foundCount: number
  savedCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  query: { id: number, versionNumber: number | null, queryText: string }
  results: Array<{
    id: number
    rank: number
    profileUrl: string
    fullName: string
    headline: string
    location: string
    score: number
    matchedTerms: string[]
    summary: string
    createdAt: string
  }>
}
type VacancyAnalysis = {
  id: number
  vacancyId: number
  vacancyVersionId: number
  status: 'draft' | 'approved'
  seniority: string | null
  titles: string[]
  locations: string[]
  ambiguities: string[]
  approvedAt: string | null
  source: 'mock' | 'openrouter'
  latestRun: AnalysisRun | null
  requirements: Requirement[]
  canMoveForward: boolean
}

const route = useRoute()
const toast = useToast()
const vacancyId = computed(() => Number(route.params.id))
const { data: vacancy, pending, error } = await useFetch<VacancyDetail>(`/api/vacancies/${route.params.id}`)
const { data: analysis, refresh: refreshAnalysis } = await useFetch<VacancyAnalysis | null>(`/api/vacancies/${route.params.id}/analysis`)
const { data: sourcingQuery, refresh: refreshSourcingQuery } = await useFetch<SourcingQueryPlan>(`/api/vacancies/${route.params.id}/sourcing-query`)
const { data: sourcingRuns, refresh: refreshSourcingRuns } = await useFetch<SourcingRun[]>(`/api/vacancies/${route.params.id}/sourcing-runs`)

const queryForm = reactive({
  queryText: '',
  providerFiltersText: ''
})

const runForm = reactive({
  queryId: undefined as number | undefined,
  desiredResults: 5,
  threshold: 70,
  profileLimit: 25,
  pageLimit: 2,
  batchSize: 5,
  cacheAgeDays: 14,
  mode: 'mock' as const
})

const form = reactive({
  seniority: '',
  titlesText: '',
  locationsText: '',
  ambiguitiesText: '',
  requirements: [] as Requirement[]
})
const busy = ref(false)
const saveError = ref('')
const queryError = ref('')
const runError = ref('')

const splitLines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const joinLines = (value: string[]) => value.join('\n')
const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const formatProviderFilters = (filters: Record<string, string[]> | undefined) => Object.entries(filters ?? {})
  .map(([provider, values]) => `${provider}: ${values.join(', ')}`)
  .join('\n')

const parseProviderFiltersText = (value: string) => Object.fromEntries(splitLines(value).map((line) => {
  const [provider = '', rawValues = ''] = line.split(':')
  return [provider.trim(), rawValues.split(',').map(item => item.trim()).filter(Boolean)]
}).filter(([provider]) => provider))

const loadForm = (value: VacancyAnalysis | null | undefined) => {
  form.seniority = value?.seniority ?? ''
  form.titlesText = joinLines(value?.titles ?? [])
  form.locationsText = joinLines(value?.locations ?? [])
  form.ambiguitiesText = joinLines(value?.ambiguities ?? [])
  form.requirements = (value?.requirements ?? []).map(requirement => ({ ...requirement }))
}

watch(analysis, value => loadForm(value), { immediate: true })

const loadQueryForm = (value: SourcingQueryPlan | null | undefined) => {
  queryForm.queryText = value?.draft?.queryText ?? ''
  queryForm.providerFiltersText = formatProviderFilters(value?.draft?.providerFilters)
}

watch(sourcingQuery, value => loadQueryForm(value), { immediate: true })
watch(sourcingQuery, (value) => {
  if (!runForm.queryId && value?.approvedVersions[0]) {
    runForm.queryId = value.approvedVersions[0].id
  }
}, { immediate: true })

const generateAnalysis = async (mode: 'mock' | 'openrouter' = 'mock') => {
  busy.value = true
  saveError.value = ''

  try {
    analysis.value = await $fetch<VacancyAnalysis>(`/api/vacancies/${vacancyId.value}/analysis`, { method: 'POST', body: { mode } })
    loadForm(analysis.value)
    toast.add({ title: mode === 'openrouter' ? 'Analise live gerada' : 'Analise mock gerada', color: 'success' })
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Nao foi possivel gerar a analise.'
    await refreshAnalysis()
  } finally {
    busy.value = false
  }
}

const addRequirement = () => {
  form.requirements.push({
    category: 'experience',
    label: '',
    normalizedLabel: '',
    provenance: '',
    weight: 50,
    isMandatory: false,
    isEliminatory: false
  })
}

const removeRequirement = (index: number) => {
  form.requirements.splice(index, 1)
}

const normalizeRequirement = (requirement: Requirement) => {
  requirement.normalizedLabel = normalizeLabel(requirement.label)
}

const saveAnalysis = async () => {
  busy.value = true
  saveError.value = ''

  try {
    analysis.value = await $fetch<VacancyAnalysis>(`/api/vacancies/${vacancyId.value}/analysis`, {
      method: 'PUT',
      body: {
        seniority: form.seniority,
        titles: splitLines(form.titlesText),
        locations: splitLines(form.locationsText),
        ambiguities: splitLines(form.ambiguitiesText),
        requirements: form.requirements
      }
    })
    loadForm(analysis.value)
    toast.add({ title: 'Rascunho salvo', color: 'success' })
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Nao foi possivel salvar a analise.'
  } finally {
    busy.value = false
  }
}

const generateSourcingQuery = async () => {
  busy.value = true
  queryError.value = ''

  try {
    sourcingQuery.value = await $fetch<SourcingQueryPlan>(`/api/vacancies/${vacancyId.value}/sourcing-query`, { method: 'POST' })
    loadQueryForm(sourcingQuery.value)
    toast.add({ title: 'Query de sourcing gerada', color: 'success' })
  } catch (err) {
    queryError.value = err instanceof Error ? err.message : 'Nao foi possivel gerar a query.'
    await refreshSourcingQuery()
  } finally {
    busy.value = false
  }
}

const saveSourcingQuery = async () => {
  busy.value = true
  queryError.value = ''

  try {
    sourcingQuery.value = await $fetch<SourcingQueryPlan>(`/api/vacancies/${vacancyId.value}/sourcing-query`, {
      method: 'PUT',
      body: {
        queryText: queryForm.queryText,
        providerFilters: parseProviderFiltersText(queryForm.providerFiltersText)
      }
    })
    loadQueryForm(sourcingQuery.value)
    toast.add({ title: 'Query salva', color: 'success' })
  } catch (err) {
    queryError.value = err instanceof Error ? err.message : 'Nao foi possivel salvar a query.'
  } finally {
    busy.value = false
  }
}

const approveSourcingQuery = async () => {
  busy.value = true
  queryError.value = ''

  try {
    sourcingQuery.value = await $fetch<SourcingQueryPlan>(`/api/vacancies/${vacancyId.value}/sourcing-query/approve`, { method: 'POST' })
    await refreshSourcingQuery()
    loadQueryForm(sourcingQuery.value)
    toast.add({ title: 'Query aprovada', color: 'success' })
  } catch (err) {
    queryError.value = err instanceof Error ? err.message : 'Nao foi possivel aprovar a query.'
  } finally {
    busy.value = false
  }
}
const runMockSourcing = async () => {
  busy.value = true
  runError.value = ''

  try {
    const run = await $fetch<SourcingRun>(`/api/vacancies/${vacancyId.value}/sourcing-runs`, {
      method: 'POST',
      body: { ...runForm }
    })
    await refreshSourcingRuns()
    if (!sourcingRuns.value?.some(item => item.id === run.id)) {
      sourcingRuns.value = [run, ...(sourcingRuns.value ?? [])]
    }
    toast.add({ title: 'Rodada mock concluida', color: 'success' })
  } catch (err) {
    runError.value = err instanceof Error ? err.message : 'Nao foi possivel rodar o mock.'
    await refreshSourcingRuns()
  } finally {
    busy.value = false
  }
}
const approveAnalysis = async () => {
  busy.value = true
  saveError.value = ''

  try {
    analysis.value = await $fetch<VacancyAnalysis>(`/api/vacancies/${vacancyId.value}/analysis/approve`, { method: 'POST' })
    await refreshAnalysis()
    loadForm(analysis.value)
    toast.add({ title: 'Analise aprovada', color: 'success' })
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Nao foi possivel aprovar a analise.'
  } finally {
    busy.value = false
  }
}
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
          {{ vacancy.company }} - {{ vacancy.location }}
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
            {{ vacancy.currentVersion?.sourceType === 'pdf_upload' ? 'PDF importado' : 'Texto colado' }}
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
            <span class="text-sm font-semibold text-highlighted">Analise da vaga</span>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :color="analysis?.canMoveForward ? 'success' : 'warning'"
                variant="subtle"
              >
                {{ analysis?.canMoveForward ? 'Aprovada para seguir' : 'Precisa aprovacao' }}
              </UBadge>
              <UBadge
                v-if="analysis?.latestRun"
                :color="analysis.latestRun.source === 'openrouter' ? 'primary' : 'neutral'"
                variant="subtle"
              >
                {{ analysis.latestRun.source === 'openrouter' ? 'Live OpenRouter' : 'Mock' }}
              </UBadge>
              <UButton
                icon="i-lucide-sparkles"
                color="primary"
                variant="subtle"
                :loading="busy"
                @click="generateAnalysis('mock')"
              >
                {{ analysis ? 'Gerar mock novamente' : 'Gerar mock' }}
              </UButton>
              <UButton
                icon="i-lucide-radio"
                color="primary"
                :loading="busy"
                @click="generateAnalysis('openrouter')"
              >
                Gerar live
              </UButton>
            </div>
          </div>
        </template>

        <div
          v-if="!analysis"
          class="py-10 text-center text-sm text-muted"
        >
          Gere uma analise mock ou live a partir da descricao revisada antes de seguir.
        </div>

        <div
          v-else
          class="space-y-5"
        >
          <UAlert
            v-if="saveError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="saveError"
          />

          <div
            v-if="analysis.latestRun"
            class="grid gap-3 rounded-lg border border-default p-3 text-sm md:grid-cols-4"
          >
            <div>
              <span class="block text-muted">Origem</span>
              <span class="font-medium text-highlighted">{{ analysis.latestRun.source === 'openrouter' ? 'Live OpenRouter' : 'Mock' }}</span>
            </div>
            <div>
              <span class="block text-muted">Modelo</span>
              <span class="font-medium text-highlighted">{{ analysis.latestRun.model ?? '-' }}</span>
            </div>
            <div>
              <span class="block text-muted">Custo</span>
              <span class="font-medium text-highlighted">{{ analysis.latestRun.costUsd ? `$${analysis.latestRun.costUsd}` : '-' }}</span>
            </div>
            <div>
              <span class="block text-muted">Status</span>
              <span class="font-medium text-highlighted">{{ analysis.latestRun.status === 'success' ? 'Sucesso' : 'Erro' }}</span>
            </div>
            <UAlert
              v-if="analysis.latestRun.errorMessage"
              class="md:col-span-4"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :description="analysis.latestRun.errorMessage"
            />
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <UFormField label="Seniority">
              <UInput
                v-model="form.seniority"
                placeholder="Senior, Head, Director"
              />
            </UFormField>
            <UFormField label="Titulos identificados">
              <UTextarea
                v-model="form.titlesText"
                autoresize
                :rows="3"
              />
            </UFormField>
            <UFormField label="Locais identificados">
              <UTextarea
                v-model="form.locationsText"
                autoresize
                :rows="3"
              />
            </UFormField>
          </div>

          <UFormField label="Ambiguidades">
            <UTextarea
              v-model="form.ambiguitiesText"
              autoresize
              :rows="3"
            />
          </UFormField>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-sm font-semibold text-highlighted">
                Requisitos
              </h2>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="subtle"
                @click="addRequirement"
              >
                Adicionar
              </UButton>
            </div>

            <div
              v-for="(requirement, index) in form.requirements"
              :key="requirement.id ?? index"
              class="rounded-lg border border-default p-4"
            >
              <div class="grid gap-3 lg:grid-cols-[1fr_1.2fr_1.2fr_96px_auto]">
                <UFormField label="Categoria">
                  <UInput v-model="requirement.category" />
                </UFormField>
                <UFormField label="Requisito">
                  <UInput
                    v-model="requirement.label"
                    @change="normalizeRequirement(requirement)"
                  />
                </UFormField>
                <UFormField label="Normalizado">
                  <UInput v-model="requirement.normalizedLabel" />
                </UFormField>
                <UFormField label="Peso">
                  <UInput
                    v-model.number="requirement.weight"
                    type="number"
                    min="0"
                    max="100"
                  />
                </UFormField>
                <div class="flex items-end justify-end">
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    aria-label="Remover requisito"
                    @click="removeRequirement(index)"
                  />
                </div>
              </div>

              <div class="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <UFormField label="Proveniencia">
                  <UTextarea
                    v-model="requirement.provenance"
                    autoresize
                    :rows="2"
                  />
                </UFormField>
                <UCheckbox
                  v-model="requirement.isMandatory"
                  label="Obrigatorio"
                  class="items-end pb-2"
                />
                <UCheckbox
                  v-model="requirement.isEliminatory"
                  label="Eliminatorio"
                  class="items-end pb-2"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
            <p class="text-sm text-muted">
              {{ analysis.canMoveForward ? 'Esta analise pode seguir para a proxima etapa.' : 'Analises nao aprovadas ficam bloqueadas.' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-save"
                color="neutral"
                variant="subtle"
                :loading="busy"
                @click="saveAnalysis"
              >
                Salvar rascunho
              </UButton>
              <UButton
                icon="i-lucide-check"
                color="success"
                :loading="busy"
                :disabled="form.requirements.length === 0"
                @click="approveAnalysis"
              >
                Aprovar analise
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-highlighted">Query de sourcing</span>
              <UBadge
                :color="sourcingQuery?.approvedVersions.length ? 'success' : 'warning'"
                variant="subtle"
              >
                {{ sourcingQuery?.approvedVersions.length ? 'Aprovada para rodadas' : 'Precisa aprovacao' }}
              </UBadge>
            </div>
            <UButton
              icon="i-lucide-search"
              color="primary"
              variant="subtle"
              :loading="busy"
              :disabled="!analysis?.canMoveForward"
              @click="generateSourcingQuery"
            >
              {{ sourcingQuery?.draft ? 'Gerar novamente' : 'Gerar query' }}
            </UButton>
          </div>
        </template>

        <div class="space-y-5">
          <UAlert
            v-if="queryError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="queryError"
          />

          <div
            v-if="!analysis?.canMoveForward"
            class="py-8 text-center text-sm text-muted"
          >
            Aprove a analise da vaga antes de gerar uma query de sourcing.
          </div>

          <div
            v-else-if="!sourcingQuery?.draft"
            class="py-8 text-center text-sm text-muted"
          >
            Gere uma query inicial a partir da analise aprovada.
          </div>

          <div
            v-else
            class="space-y-4"
          >
            <UFormField label="Query provider-neutral">
              <UTextarea
                v-model="queryForm.queryText"
                autoresize
                :rows="4"
              />
            </UFormField>

            <UFormField label="Filtros de provedor">
              <UTextarea
                v-model="queryForm.providerFiltersText"
                autoresize
                :rows="3"
                placeholder="linkedin: Brazil, Head\napify: people search"
              />
            </UFormField>

            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-lg border border-default p-3">
                <span class="text-xs font-medium uppercase text-muted">Explicacao</span>
                <p class="mt-2 text-sm text-toned">
                  {{ sourcingQuery.draft.explanation }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <span class="text-xs font-medium uppercase text-muted">Assumptions</span>
                <ul class="mt-2 space-y-1 text-sm text-toned">
                  <li
                    v-for="assumption in sourcingQuery.draft.assumptions"
                    :key="assumption"
                  >
                    {{ assumption }}
                  </li>
                </ul>
              </div>
              <div class="rounded-lg border border-default p-3">
                <span class="text-xs font-medium uppercase text-muted">Limites</span>
                <ul class="mt-2 space-y-1 text-sm text-toned">
                  <li
                    v-for="limitation in sourcingQuery.draft.limitations"
                    :key="limitation"
                  >
                    {{ limitation }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
              <p class="text-sm text-muted">
                Queries aprovadas ficam versionadas e podem ser usadas por rodadas futuras.
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  icon="i-lucide-save"
                  color="neutral"
                  variant="subtle"
                  :loading="busy"
                  @click="saveSourcingQuery"
                >
                  Salvar query
                </UButton>
                <UButton
                  icon="i-lucide-check"
                  color="success"
                  :loading="busy"
                  :disabled="!queryForm.queryText.trim()"
                  @click="approveSourcingQuery"
                >
                  Aprovar query
                </UButton>
              </div>
            </div>
          </div>

          <div
            v-if="sourcingQuery?.approvedVersions.length"
            class="space-y-3 border-t border-default pt-4"
          >
            <h2 class="text-sm font-semibold text-highlighted">
              Versoes aprovadas
            </h2>
            <div
              v-for="version in sourcingQuery.approvedVersions"
              :key="version.id"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <UBadge
                  color="success"
                  variant="subtle"
                >
                  Versao {{ version.versionNumber }}
                </UBadge>
                <UBadge
                  color="primary"
                  variant="subtle"
                >
                  Selecionavel para rodada
                </UBadge>
              </div>
              <pre class="mt-3 whitespace-pre-wrap text-sm text-toned"><code>{{ version.queryText }}</code></pre>
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-highlighted">Rodada mock de sourcing</span>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                Sem credenciais externas
              </UBadge>
            </div>
            <UButton
              icon="i-lucide-play"
              color="primary"
              :loading="busy"
              :disabled="!runForm.queryId"
              @click="runMockSourcing"
            >
              Rodar mock
            </UButton>
          </div>
        </template>

        <div class="space-y-5">
          <UAlert
            v-if="runError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="runError"
          />

          <div
            v-if="!sourcingQuery?.approvedVersions.length"
            class="py-8 text-center text-sm text-muted"
          >
            Aprove uma versao da query antes de iniciar uma rodada mock.
          </div>

          <div
            v-else
            class="space-y-4"
          >
            <div class="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
              <UFormField
                label="Query aprovada"
                class="md:col-span-2"
              >
                <USelect
                  v-model="runForm.queryId"
                  :items="sourcingQuery.approvedVersions.map(version => ({ label: `Versao ${version.versionNumber}`, value: version.id }))"
                />
              </UFormField>
              <UFormField label="Resultados">
                <UInput
                  v-model.number="runForm.desiredResults"
                  type="number"
                  min="1"
                  max="50"
                />
              </UFormField>
              <UFormField label="Threshold">
                <UInput
                  v-model.number="runForm.threshold"
                  type="number"
                  min="0"
                  max="100"
                />
              </UFormField>
              <UFormField label="Perfis">
                <UInput
                  v-model.number="runForm.profileLimit"
                  type="number"
                  min="1"
                  max="500"
                />
              </UFormField>
              <UFormField label="Paginas">
                <UInput
                  v-model.number="runForm.pageLimit"
                  type="number"
                  min="1"
                  max="50"
                />
              </UFormField>
              <UFormField label="Lote">
                <UInput
                  v-model.number="runForm.batchSize"
                  type="number"
                  min="1"
                  max="100"
                />
              </UFormField>
            </div>
            <div class="grid gap-3 md:grid-cols-4">
              <UFormField label="Cache maximo (dias)">
                <UInput
                  v-model.number="runForm.cacheAgeDays"
                  type="number"
                  min="0"
                  max="365"
                />
              </UFormField>
              <UFormField label="Modo">
                <UInput
                  v-model="runForm.mode"
                  disabled
                />
              </UFormField>
            </div>
          </div>

          <div
            v-if="sourcingRuns?.length"
            class="space-y-3 border-t border-default pt-4"
          >
            <h2 class="text-sm font-semibold text-highlighted">
              Rodadas salvas
            </h2>
            <div
              v-for="run in sourcingRuns"
              :key="run.id"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    color="success"
                    variant="subtle"
                  >
                    {{ run.status === 'completed' ? 'Concluida' : run.status }}
                  </UBadge>
                  <UBadge
                    color="primary"
                    variant="subtle"
                  >
                    Query v{{ run.query.versionNumber }}
                  </UBadge>
                  <span class="text-sm text-muted">{{ run.savedCount }} salvos de {{ run.foundCount }} encontrados</span>
                </div>
                <span class="text-sm font-medium text-highlighted">{{ run.progress }}%</span>
              </div>
              <UProgress
                :model-value="run.progress"
                class="mt-3"
              />
              <div class="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <span class="text-muted">Resultados: {{ run.config.desiredResults }}</span>
                <span class="text-muted">Threshold: {{ run.config.threshold }}</span>
                <span class="text-muted">Limites: {{ run.config.profileLimit }} perfis, {{ run.config.pageLimit }} paginas, lote {{ run.config.batchSize }}</span>
              </div>
              <div class="mt-4 space-y-2">
                <div
                  v-for="result in run.results"
                  :key="result.id"
                  class="rounded-md border border-default p-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold text-highlighted">
                        #{{ result.rank }} {{ result.fullName }}
                      </p>
                      <p class="text-sm text-toned">
                        {{ result.headline }} - {{ result.location }}
                      </p>
                    </div>
                    <UBadge
                      color="success"
                      variant="subtle"
                    >
                      {{ result.score }}
                    </UBadge>
                  </div>
                  <p class="mt-2 text-sm text-muted">
                    {{ result.summary }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <UBadge
                      v-for="term in result.matchedTerms"
                      :key="term"
                      color="neutral"
                      variant="subtle"
                    >
                      {{ term }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm font-semibold text-highlighted">Descricao original revisada</span>
            <UBadge
              color="primary"
              variant="subtle"
            >
              Versao {{ vacancy.currentVersion?.versionNumber ?? 1 }} - imutavel
            </UBadge>
          </div>
        </template>

        <pre class="max-h-[720px] overflow-auto whitespace-pre-wrap rounded-lg bg-elevated p-4 text-sm leading-6 text-toned"><code>{{ vacancy.currentVersion?.reviewedText }}</code></pre>
      </UCard>
    </div>
  </UContainer>
</template>
