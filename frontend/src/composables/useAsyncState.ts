import { ref, type Ref } from 'vue'

export function useAsyncState<T>(initialValue: T) {
  const data: Ref<T> = ref(initialValue) as Ref<T>
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  async function execute(fn: () => Promise<T>) {
    isLoading.value = true
    error.value = null
    try {
      data.value = await fn()
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      isLoading.value = false
    }
  }

  return { data, error, isLoading, execute }
}
