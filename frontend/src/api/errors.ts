/**
 * API error utilities.
 */
import type { ApiError } from './types'

export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    typeof (err as ApiError).error === 'object' &&
    'code' in (err as ApiError).error &&
    'message' in (err as ApiError).error
  )
}

export async function parseApiError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (isApiError(body)) {
    return body
  }
  // Normalise non-standard error bodies
  return {
    error: {
      code: String(response.status),
      message: (body as { message?: string })?.message ?? response.statusText,
    },
  }
}
