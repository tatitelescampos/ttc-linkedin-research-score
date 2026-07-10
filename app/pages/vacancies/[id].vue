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
  requirements: Requirement[]
  canMoveForward: boolean
}

const route = useRoute()
const toast = useToast()
const vacancyId = computed(() => Number(route.params.id))
const { data: vacancy, pending, error } = await useFetch<VacancyDetail>(`/api/vacancies/${route.params.id}`)
const { data: analysis, refresh: refreshAnalysis } = await useFetch<VacancyAnalysis | null>(`/api/vacancies/${route.params.id}/analysis`)

const form = reactive({
  seniority: '',
  titlesText: '',
  locationsText: '',
  ambiguitiesText: '',
  requirements: [] as Requirement[]
})
const busy = ref(false)
const saveError = ref('')

const splitLines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const joinLines = (value: string[]) => value.join('\n')
const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const loadForm = (value: VacancyAnalysis | null | undefined) => {
  form.seniority = value?.seniority ?? ''
  form.titlesText = joinLines(value?.titles ?? [])
  form.locationsText = joinLines(value?.locations ?? [])
  form.ambiguitiesText = joinLines(value?.ambiguities ?? [])
  form.requirements = (value?.requirements ?? []).map(requirement => ({ ...requirement }))
}

watch(analysis, value => loadForm(value), { immediate: true })

const generateAnalysis = async () => {
  busy.value = true
  saveError.value = ''

  try {
    analysis.value = await $fetch<VacancyAnalysis>(`/api/vacancies/${vacancyId.value}/analysis`, { method: 'POST' })
    loadForm(analysis.value)
    toast.add({ title: 'Analise gerada', color: 'success' })
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Nao foi possivel gerar a analise.'
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
            <span class="text-sm font-semibold text-highlighted">Analise mock da vaga</span>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :color="analysis?.canMoveForward ? 'success' : 'warning'"
                variant="subtle"
              >
                {{ analysis?.canMoveForward ? 'Aprovada para seguir' : 'Precisa aprovacao' }}
              </UBadge>
              <UButton
                icon="i-lucide-sparkles"
                color="primary"
                variant="subtle"
                :loading="busy"
                @click="generateAnalysis"
              >
                {{ analysis ? 'Gerar novamente' : 'Gerar analise' }}
              </UButton>
            </div>
          </div>
        </template>

        <div
          v-if="!analysis"
          class="py-10 text-center text-sm text-muted"
        >
          Gere uma analise deterministica a partir da descricao revisada antes de seguir.
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
