/**
 * Shared API types — pagination, error, list response shapes.
 */

export interface ListResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export interface ApiError {
  error: {
    code: string
    message: string
    field?: string
    details?: { field: string; code: string; message: string }[]
    trace_id?: string
  }
}

export interface PaginationParams {
  page?: number
  per_page?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}
