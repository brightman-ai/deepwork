/**
 * Typed API client — thin wrapper over the existing axios instance.
 *
 * Uses the project-standard `api` axios instance from @/boot/axios so that
 * baseURL (/api), timeout, and TS-OBS trace injection are all inherited.
 */
import { api } from '@ce/boot/axios'
import type { ListResponse, PaginationParams } from './types'
import { isApiError, parseApiError } from './errors'

/** Re-export so callers can import from a single location. */
export type { ListResponse, PaginationParams }
export { isApiError, parseApiError }

// ── Internal helper ──────────────────────────────────────────────────────────

async function handleAxios<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    const response = await promise
    return response.data
  } catch (err: unknown) {
    // axios wraps non-2xx HTTP errors; re-throw as ApiError if possible
    const axiosErr = err as { response?: { data?: unknown; status?: number; statusText?: string } }
    if (axiosErr?.response) {
      const { data, status, statusText } = axiosErr.response
      if (isApiError(data)) throw data
      throw {
        error: {
          code: String(status ?? 'UNKNOWN'),
          message: (data as { message?: string })?.message ?? statusText ?? 'Unknown error',
        },
      }
    }
    throw err
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * GET request returning a single resource of type T.
 */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return handleAxios(api.get<T>(url, { params }))
}

/**
 * GET request returning a paginated list of T.
 * Expects the server to return a ListResponse<T> envelope.
 */
export async function apiGetList<T>(
  url: string,
  params?: PaginationParams & Record<string, unknown>,
): Promise<ListResponse<T>> {
  return handleAxios(api.get<ListResponse<T>>(url, { params }))
}

/**
 * POST request returning T.
 */
export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return handleAxios(api.post<T>(url, body))
}

/**
 * PATCH request returning T.
 */
export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return handleAxios(api.patch<T>(url, body))
}

/**
 * PUT request returning T.
 */
export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  return handleAxios(api.put<T>(url, body))
}

/**
 * DELETE request (no response body expected).
 */
export async function apiDelete(url: string): Promise<void> {
  await handleAxios(api.delete<void>(url))
}
