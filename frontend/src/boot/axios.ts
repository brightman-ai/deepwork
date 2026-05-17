import axios, { AxiosInstance } from 'axios'
import { installAxiosTrace } from '../utils/obs'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// TS-OBS: auto-inject X-Trace-ID from config.trace
installAxiosTrace(api)

export { api }
