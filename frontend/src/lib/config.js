const LOCAL_API_URL = 'http://localhost:3001'
const PROD_API_URL = 'https://auctionarena-org.onrender.com'

function normalizeUrl(url) {
  return url?.replace(/\/+$/, '')
}

function getDefaultApiUrl() {
  if (typeof window === 'undefined') return PROD_API_URL

  const hostname = window.location.hostname
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0'

  return isLocal ? LOCAL_API_URL : PROD_API_URL
}

export const API_BASE_URL = normalizeUrl(
  import.meta.env.VITE_SOCKET_URL || getDefaultApiUrl()
)
