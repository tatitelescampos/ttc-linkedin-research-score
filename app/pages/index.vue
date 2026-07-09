<script setup lang="ts">
type VacancyListItem = {
  id: number
  title: string
  company: string
  location: string
  sourceUrl: string | null
  seniority: string | null
  sourcingComment: string | null
  descriptionPreview: string
  createdAt: string
}

type PdfExtractionResult = {
  filename: string
  mimeType: string
  sizeBytes: number
  extractedText: string
  characterCount: number
}

const emptyForm = () => ({
  title: '',
  company: '',
  location: '',
  sourceUrl: '',
  seniority: '',
  sourcingComment: '',
  description: ''
})

const form = reactive(emptyForm())
const mode = ref<'paste' | 'pdf'>('paste')
const search = ref('')
const createPending = ref(false)
const extractPending = ref(false)
const createError = ref('')
const createSuccess = ref('')
const extractionError = ref('')
const extractedPdf = ref<PdfExtractionResult | null>(null)
const selectedPdf = ref<File | null>(null)

const { data: vacancies, pending: listPending, refresh } = await useFetch<VacancyListItem[]>('/api/vacancies', {
  query: { search },
  default: () => []
})

watch(search, () => refresh())

const resetForm = () => {
  Object.assign(form, emptyForm())
  selectedPdf.value = null
  extractedPdf.value = null
  extractionError.value = ''
}

const selectMode = (nextMode: 'paste' | 'pdf') => {
  mode.value = nextMode
  createError.value = ''
  createSuccess.value = ''
  extractionError.value = ''
}

const handlePdfChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  selectedPdf.value = input.files?.[0] ?? null
  extractedPdf.value = null
  extractionError.value = ''
}

const extractPdf = async () => {
  if (!selectedPdf.value) {
    extractionError.value = 'Selecione um PDF antes de extrair.'
    return
  }

  extractPending.value = true
  extractionError.value = ''
  createSuccess.value = ''

  try {
    const body = new FormData()
    body.append('file', selectedPdf.value)
    const result = await $fetch<PdfExtractionResult>('/api/vacancies/extract-pdf', {
      method: 'POST',
      body
    })

    extractedPdf.value = result
    form.description = result.extractedText
  } catch (error) {
    extractionError.value = error instanceof Error ? error.message : 'Nao foi possivel extrair texto do PDF.'
  } finally {
    extractPending.value = false
  }
}

const createVacancy = async () => {
  createPending.value = true
  createError.value = ''
  createSuccess.value = ''

  try {
    const vacancy = await $fetch<{ id: number }>('/api/vacancies', {
      method: 'POST',
      body: {
        ...form,
        sourceType: mode.value === 'pdf' ? 'pdf_upload' : 'pasted_text',
        originalDescription: mode.value === 'pdf' ? extractedPdf.value?.extractedText : form.description
      }
    })

    resetForm()
    await refresh()
    createSuccess.value = `Vaga #${vacancy.id} salva com versao inicial.`
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Nao foi possivel salvar a vaga.'
  } finally {
    createPending.value = false
  }
}
</script>

<template>
  <UContainer class="py-8 sm:py-10">
    <div class="grid gap-6 border-b border-default pb-8 xl:grid-cols-[430px_1fr]">
      <section class="space-y-5">
        <div>
          <UBadge
            color="primary"
            variant="solid"
            icon="i-lucide-briefcase-business"
            class="text-inverted"
          >
            Workspace de vagas
          </UBadge>
          <h1 class="mt-4 text-3xl font-bold leading-tight text-highlighted sm:text-4xl">
            Criar e navegar vagas
          </h1>
          <p class="mt-3 text-sm leading-6 text-muted">
            Cole uma descricao ou importe um PDF digital, revise o texto e preserve a primeira versao para analise e sourcing futuros.
          </p>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-semibold text-highlighted">Criar vaga</span>
              <div class="flex gap-2">
                <UButton
                  size="xs"
                  :color="mode === 'paste' ? 'primary' : 'neutral'"
                  :variant="mode === 'paste' ? 'solid' : 'subtle'"
                  @click="selectMode('paste')"
                >
                  Colar texto
                </UButton>
                <UButton
                  size="xs"
                  :color="mode === 'pdf' ? 'primary' : 'neutral'"
                  :variant="mode === 'pdf' ? 'solid' : 'subtle'"
                  @click="selectMode('pdf')"
                >
                  Importar PDF
                </UButton>
              </div>
            </div>
          </template>

          <form
            class="space-y-5"
            @submit.prevent="createVacancy"
          >
            <div
              v-if="mode === 'pdf'"
              class="space-y-4 rounded-lg border border-default p-4"
            >
              <UFormField
                label="PDF digital da vaga"
                name="pdf"
                help="Use PDFs digitais com texto selecionavel. PDFs escaneados entram no proximo slice de OCR."
                required
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  class="block w-full text-sm text-toned file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-inverted"
                  @change="handlePdfChange"
                >
              </UFormField>

              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  type="button"
                  icon="i-lucide-file-text"
                  :loading="extractPending"
                  :disabled="!selectedPdf"
                  @click="extractPdf"
                >
                  Extrair texto
                </UButton>
                <span class="text-sm text-muted">
                  {{ selectedPdf?.name || 'Nenhum PDF selecionado' }}
                </span>
              </div>

              <UAlert
                v-if="extractionError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                title="Falha na extracao"
                :description="extractionError"
              />
              <UAlert
                v-if="extractedPdf"
                color="success"
                variant="subtle"
                icon="i-lucide-check-circle"
                title="Texto extraido para revisao"
                :description="`${extractedPdf.characterCount} caracteres extraidos de ${extractedPdf.filename}.`"
              />
            </div>

            <UFormField
              label="Titulo da vaga"
              name="title"
              required
            >
              <UInput
                v-model="form.title"
                icon="i-lucide-briefcase"
                placeholder="Head, Last Mile Growth & Ops"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Empresa"
                name="company"
                required
              >
                <UInput
                  v-model="form.company"
                  icon="i-lucide-building-2"
                  placeholder="Amazon"
                />
              </UFormField>

              <UFormField
                label="Localizacao"
                name="location"
                required
              >
                <UInput
                  v-model="form.location"
                  icon="i-lucide-map-pin"
                  placeholder="Osasco, Sao Paulo, Brazil"
                />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Senioridade"
                name="seniority"
              >
                <UInput
                  v-model="form.seniority"
                  icon="i-lucide-chart-no-axes-combined"
                  placeholder="Head, Director, Manager..."
                />
              </UFormField>

              <UFormField
                label="URL da vaga"
                name="sourceUrl"
              >
                <UInput
                  v-model="form.sourceUrl"
                  icon="i-lucide-link"
                  placeholder="https://..."
                />
              </UFormField>
            </div>

            <UFormField
              label="Comentario de sourcing"
              name="sourcingComment"
            >
              <UInput
                v-model="form.sourcingComment"
                icon="i-lucide-message-square-text"
                placeholder="Contexto opcional para a busca"
              />
            </UFormField>

            <UFormField
              :label="mode === 'pdf' ? 'Texto extraido para revisao' : 'Descricao original'"
              name="description"
              help="Esta primeira versao fica preservada para auditoria."
              required
            >
              <UTextarea
                v-model="form.description"
                :rows="10"
                class="w-full"
                :placeholder="mode === 'pdf' ? 'Extraia o PDF e corrija o texto aqui...' : 'Cole a descricao completa da vaga...'"
              />
            </UFormField>

            <UAlert
              v-if="createError"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              title="Nao foi possivel salvar"
              :description="createError"
            />
            <UAlert
              v-if="createSuccess"
              color="success"
              variant="subtle"
              icon="i-lucide-check-circle"
              title="Vaga salva"
              :description="createSuccess"
            />

            <UButton
              type="submit"
              icon="i-lucide-save"
              :loading="createPending"
              class="text-inverted"
              block
            >
              {{ mode === 'pdf' ? 'Salvar vaga revisada' : 'Salvar vaga' }}
            </UButton>
          </form>
        </UCard>
      </section>

      <section class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-sm font-semibold text-highlighted">Vagas cadastradas</span>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                {{ vacancies.length }} registros
              </UBadge>
            </div>
          </template>

          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Buscar por titulo, empresa, localizacao ou descricao"
            class="mb-4"
          />

          <div
            v-if="listPending"
            class="py-10 text-center text-sm text-muted"
          >
            Carregando vagas...
          </div>

          <div
            v-else-if="vacancies.length === 0"
            class="py-10 text-center"
          >
            <UIcon
              name="i-lucide-inbox"
              class="mx-auto size-8 text-muted"
            />
            <p class="mt-3 text-sm text-muted">
              Nenhuma vaga encontrada.
            </p>
          </div>

          <div
            v-else
            class="divide-y divide-default"
          >
            <article
              v-for="vacancy in vacancies"
              :key="vacancy.id"
              class="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <NuxtLink
                    :to="`/vacancies/${vacancy.id}`"
                    class="font-semibold text-highlighted hover:text-primary"
                  >
                    {{ vacancy.title }}
                  </NuxtLink>
                  <UBadge
                    v-if="vacancy.seniority"
                    color="primary"
                    variant="subtle"
                  >
                    {{ vacancy.seniority }}
                  </UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">
                  {{ vacancy.company }} - {{ vacancy.location }}
                </p>
                <p class="mt-2 line-clamp-2 text-sm leading-6 text-toned">
                  {{ vacancy.descriptionPreview }}
                </p>
              </div>

              <UButton
                :to="`/vacancies/${vacancy.id}`"
                icon="i-lucide-arrow-right"
                color="neutral"
                variant="subtle"
              >
                Ver detalhes
              </UButton>
            </article>
          </div>
        </UCard>
      </section>
    </div>
  </UContainer>
</template>
