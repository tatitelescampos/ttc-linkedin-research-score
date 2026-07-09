<script setup lang="ts">
const { data: health } = await useFetch('/api/health')

const confidence = ref(72)
const strictMode = ref(true)
const selectedSegment = ref('operator')

const segmentOptions = [
  { label: 'Operator', value: 'operator' },
  { label: 'Reviewer', value: 'reviewer' },
  { label: 'Admin', value: 'admin' }
]

const tabs = [
  { label: 'Inputs', icon: 'i-lucide-sliders-horizontal', slot: 'inputs' as const },
  { label: 'Statuses', icon: 'i-lucide-activity', slot: 'statuses' as const },
  { label: 'Rows', icon: 'i-lucide-list-checks', slot: 'rows' as const }
]

const rows = [
  { company: 'Northstar Ops', signal: 'Hiring motion', score: 86, status: 'Ready' },
  { company: 'Blueframe Systems', signal: 'VP change', score: 71, status: 'Review' },
  { company: 'Atlas Works', signal: 'Low activity', score: 42, status: 'Hold' }
]

const query = `SELECT company, signal_score, confidence
FROM linkedin_research
WHERE signal_score >= 70
ORDER BY confidence DESC;`
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <div class="grid gap-8 border-b border-default pb-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <UBadge
          color="primary"
          variant="solid"
          icon="i-lucide-zap"
          class="text-inverted"
        >
          GET STARTED
        </UBadge>
        <h1 class="mt-6 max-w-3xl text-4xl font-bold leading-tight text-highlighted sm:text-6xl">
          TTC LinkedIn Research Score
        </h1>
        <p class="mt-5 max-w-2xl text-base leading-7 text-default sm:text-lg">
          Black canvas, electric yellow actions, dark cards, crisp product UI, and code-forward verification for the Nuxt UI theme.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <UButton
            icon="i-lucide-refresh-cw"
            variant="solid"
            class="text-inverted"
          >
            Run check
          </UButton>
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="solid"
            to="/"
          >
            Home
          </UButton>
        </div>
      </div>

      <UCard class="bg-elevated">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-highlighted">Query preview</span>
            <UBadge
              color="success"
              variant="subtle"
            >
              Live
            </UBadge>
          </div>
        </template>

        <pre class="overflow-x-auto text-sm leading-6 text-toned"><code>{{ query }}</code></pre>
      </UCard>
    </div>

    <div class="grid gap-4 py-10 sm:grid-cols-3">
      <div>
        <p class="text-5xl font-bold leading-none text-primary">
          779+
        </p>
        <p class="mt-2 text-sm text-muted">
          Profiles scored
        </p>
      </div>
      <div>
        <p class="text-5xl font-bold leading-none text-primary">
          2.8k+
        </p>
        <p class="mt-2 text-sm text-muted">
          Signals evaluated
        </p>
      </div>
      <div>
        <p class="text-5xl font-bold leading-none text-primary">
          47k+
        </p>
        <p class="mt-2 text-sm text-muted">
          Rows processed
        </p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-highlighted">Health</span>
            <UBadge
              color="success"
              variant="subtle"
            >
              Online
            </UBadge>
          </div>
        </template>

        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="text-3xl font-semibold text-highlighted">
              {{ health?.researchItems ?? 0 }}
            </p>
            <p class="mt-1 text-sm text-muted">
              Research items
            </p>
          </div>
          <UIcon
            name="i-lucide-database"
            class="size-8 text-primary"
          />
        </div>
      </UCard>

      <UCard class="bg-primary text-inverted ring-primary">
        <template #header>
          <span class="text-sm font-semibold text-inverted">Score threshold</span>
        </template>

        <USlider
          v-model="confidence"
          :min="0"
          :max="100"
        />
        <div class="mt-4 flex items-center justify-between text-sm">
          <span>Confidence</span>
          <span class="font-semibold">{{ confidence }}%</span>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <span class="text-sm font-semibold text-highlighted">Controls</span>
        </template>

        <div class="space-y-4">
          <USwitch
            v-model="strictMode"
            label="Strict scoring"
          />
          <USelect
            v-model="selectedSegment"
            :items="segmentOptions"
            class="w-full"
          />
        </div>
      </UCard>
    </div>

    <UCard class="mt-4 bg-elevated">
      <UTabs
        :items="tabs"
        class="w-full"
      >
        <template #inputs>
          <div class="grid gap-4 pt-4 md:grid-cols-3">
            <UFormField
              label="Company"
              name="company"
            >
              <UInput
                icon="i-lucide-building-2"
                placeholder="Acme Inc."
              />
            </UFormField>
            <UFormField
              label="LinkedIn URL"
              name="linkedin"
            >
              <UInput
                icon="i-simple-icons-linkedin"
                placeholder="linkedin.com/company/..."
              />
            </UFormField>
            <UFormField
              label="Signal"
              name="signal"
            >
              <UInput
                icon="i-lucide-radar"
                placeholder="New executive hire"
              />
            </UFormField>
          </div>
        </template>

        <template #statuses>
          <div class="grid gap-3 pt-4 md:grid-cols-3">
            <UAlert
              color="success"
              variant="subtle"
              icon="i-lucide-check-circle"
              title="Matched"
              description="Success states stay readable on the dark canvas."
            />
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Review"
              description="Warnings stay distinct from electric yellow CTAs."
            />
            <UAlert
              color="error"
              variant="subtle"
              icon="i-lucide-circle-x"
              title="Blocked"
              description="Error states remain clear in compact surfaces."
            />
          </div>
        </template>

        <template #rows>
          <div class="overflow-hidden pt-4">
            <div class="grid grid-cols-[1.2fr_1fr_auto_auto] gap-3 border-b border-default px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted">
              <span>Company</span>
              <span>Signal</span>
              <span>Score</span>
              <span>Status</span>
            </div>
            <div
              v-for="row in rows"
              :key="row.company"
              class="grid grid-cols-[1.2fr_1fr_auto_auto] items-center gap-3 border-b border-default px-3 py-3 last:border-b-0"
            >
              <span class="font-medium text-highlighted">{{ row.company }}</span>
              <span class="text-sm text-muted">{{ row.signal }}</span>
              <UBadge
                color="primary"
                variant="soft"
              >
                {{ row.score }}
              </UBadge>
              <UBadge
                :color="row.status === 'Ready' ? 'success' : row.status === 'Review' ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ row.status }}
              </UBadge>
            </div>
          </div>
        </template>
      </UTabs>
    </UCard>
  </UContainer>
</template>
