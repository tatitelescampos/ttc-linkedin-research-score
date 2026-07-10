<script setup lang="ts">
const toast = useToast()
const busy = ref(false)
const restoreError = ref('')

const restoreBackup = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busy.value = true
  restoreError.value = ''

  try {
    const backup = JSON.parse(await file.text())
    await $fetch('/api/admin/backup', { method: 'POST', body: backup })
    toast.add({ title: 'Backup restaurado', color: 'success' })
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : 'Nao foi possivel restaurar o backup.'
  } finally {
    busy.value = false
    input.value = ''
  }
}
</script>

<template>
  <UContainer class="py-8">
    <div class="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">
          Operacoes locais
        </h1>
        <p class="mt-1 text-sm text-muted">
          Backup e restore do banco local.
        </p>
      </div>

      <UCard>
        <template #header>
          <span class="text-sm font-semibold text-highlighted">Backup</span>
        </template>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-download"
            color="primary"
            to="/api/admin/backup"
            target="_blank"
          >
            Baixar backup JSON
          </UButton>
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-default px-3 py-2 text-sm text-highlighted hover:bg-elevated">
            <span>Restaurar JSON</span>
            <input
              class="sr-only"
              type="file"
              accept="application/json"
              :disabled="busy"
              @change="restoreBackup"
            >
          </label>
        </div>
        <UAlert
          v-if="restoreError"
          class="mt-4"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="restoreError"
        />
      </UCard>
    </div>
  </UContainer>
</template>
