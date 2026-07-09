<script setup lang="ts">
type ProbeCoverageField = { path: string, count: number, examples: string[] }
type ProbeResult = {
  ok: boolean
  status: number
  actorId: string
  durationMs: number
  requested: { query: string, maxResults: number, timeoutSeconds: number }
  counts: { returnedItems: number, fieldPaths: number }
  costs: { source: string, availableInPayload: boolean, note: string }
  coverage: ProbeCoverageField[]
  payload: unknown
  error: null | { message: string, status: number }
}

const query = ref('site:linkedin.com/in operations logistics last mile Sao Paulo')
const maxResults = ref(3)
const timeoutSeconds = ref(30)
const result = ref<ProbeResult | null>(null)
const pending = ref(false)
const clientError = ref('')

const rawPayload = computed(() => result.value ? JSON.stringify(result.value.payload, null, 2) : '')
const statusColor = computed(() => !result.value ? 'neutral' : result.value.ok ? 'success' : 'error')

const runProbe = async () => {
  pending.value = true
  clientError.value = ''
  result.value = null

  try {
    result.value = await $fetch<ProbeResult>('/api/apify/probe', {
      method: 'POST',
      body: { query: query.value, maxResults: maxResults.value, timeoutSeconds: timeoutSeconds.value }
    })
  } catch (error) {
    clientError.value = error instanceof Error ? error.message : 'Nao foi possivel executar a sondagem.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UContainer class="py-8 sm:py-10">
    <div class="grid gap-6 border-b border-default pb-8 xl:grid-cols-[420px_1fr]">
      <section class="space-y-5">
        <div>
          <UBadge
            color="primary"
            variant="solid"
            icon="i-lucide-radar"
            class="text-inverted"
          >
            Sondagem manual
          </UBadge>
          <h1 class="mt-4 text-3xl font-bold leading-tight text-highlighted sm:text-4xl">
            Probe Apify para descoberta de resposta
          </h1>
          <p class="mt-3 text-sm leading-6 text-muted">
            Execute uma busca pequena e deliberada no ator configurado. A credencial fica no servidor e a resposta volta para inspecao antes de qualquer fluxo de vaga existir.
          </p>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-semibold text-highlighted">Entrada do teste</span>
              <UBadge
                color="warning"
                variant="subtle"
              >
                Manual
              </UBadge>
            </div>
          </template>

          <form
            class="space-y-5"
            @submit.prevent="runProbe"
          >
            <UFormField
              label="Consulta pequena"
              name="query"
              help="Use uma consulta intencional e curta para reduzir custo."
              required
            >
              <UTextarea
                v-model="query"
                :rows="4"
                class="w-full"
                placeholder="Ex.: operations logistics last mile Sao Paulo"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Limite de perfis"
                name="maxResults"
              >
                <UInputNumber
                  v-model="maxResults"
                  :min="1"
                  :max="5"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Tempo limite"
                name="timeoutSeconds"
              >
                <UInputNumber
                  v-model="timeoutSeconds"
                  :min="5"
                  :max="60"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UAlert
              v-if="clientError"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              title="Falha na sondagem"
              :description="clientError"
            />
            <UButton
              type="submit"
              icon="i-lucide-play"
              :loading="pending"
              class="text-inverted"
              block
            >
              Executar chamada Apify
            </UButton>
          </form>
        </UCard>
      </section>

      <section class="space-y-4">
        <div class="grid gap-4 md:grid-cols-4">
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-normal text-muted">
              Status
            </p>
            <UBadge
              class="mt-3"
              :color="statusColor"
              variant="subtle"
            >
              {{ result ? (result.ok ? 'Sucesso' : 'Falha') : 'Aguardando' }}
            </UBadge>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-normal text-muted">
              Itens
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ result?.counts.returnedItems ?? 0 }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-normal text-muted">
              Campos
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ result?.counts.fieldPaths ?? 0 }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-normal text-muted">
              Duracao
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ result ? `${result.durationMs}ms` : '-' }}
            </p>
          </UCard>
        </div>

        <UAlert
          v-if="result?.error"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Resposta de erro"
          :description="result.error.message"
        />

        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-sm font-semibold text-highlighted">Resumo seguro</span>
              <UBadge
                :color="result?.costs.availableInPayload ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ result?.costs.availableInPayload ? 'Custo no payload' : 'Custo nao encontrado' }}
              </UBadge>
            </div>
          </template>

          <div
            v-if="result"
            class="space-y-4"
          >
            <div class="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p class="font-medium text-highlighted">
                  Ator
                </p>
                <p class="mt-1 break-all text-muted">
                  {{ result.actorId }}
                </p>
              </div>
              <div>
                <p class="font-medium text-highlighted">
                  HTTP
                </p>
                <p class="mt-1 text-muted">
                  {{ result.status || 'sem resposta' }}
                </p>
              </div>
              <div>
                <p class="font-medium text-highlighted">
                  Custo
                </p>
                <p class="mt-1 text-muted">
                  {{ result.costs.note }}
                </p>
              </div>
            </div>

            <div class="overflow-x-auto rounded-lg border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-elevated">
                  <tr>
                    <th class="px-3 py-2 text-left font-semibold text-muted">
                      Campo
                    </th>
                    <th class="px-3 py-2 text-left font-semibold text-muted">
                      Ocorrencias
                    </th>
                    <th class="px-3 py-2 text-left font-semibold text-muted">
                      Exemplos
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr
                    v-for="field in result.coverage"
                    :key="field.path"
                  >
                    <td class="px-3 py-2 font-mono text-xs text-highlighted">
                      {{ field.path }}
                    </td>
                    <td class="px-3 py-2 text-muted">
                      {{ field.count }}
                    </td>
                    <td class="px-3 py-2 text-muted">
                      {{ field.examples.join(' | ') }}
                    </td>
                  </tr>
                  <tr v-if="result.coverage.length === 0">
                    <td
                      colspan="3"
                      class="px-3 py-8 text-center text-muted"
                    >
                      Nenhum campo retornado para resumir.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            title="Nenhuma chamada executada"
            description="Preencha a consulta e clique em executar para inspecionar uma resposta real."
          />
        </UCard>
      </section>
    </div>

    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-semibold text-highlighted">Payload bruto</span>
          <UBadge
            color="neutral"
            variant="subtle"
          >
            Somente resposta
          </UBadge>
        </div>
      </template>
      <pre class="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-elevated p-4 text-xs leading-5 text-toned"><code>{{ rawPayload || 'Execute uma chamada para ver o payload bruto.' }}</code></pre>
    </UCard>
  </UContainer>
</template>
