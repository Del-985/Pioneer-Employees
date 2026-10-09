export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://api.pioneerlegacyworks.com'
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : '/'+path}`;
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Could not connect to the Pioneer API. Check your network or ask a manager.', 0, 'CONNECTION_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || payload?.message || `Request failed (${response.status}).`,
      response.status,
      payload?.error?.code || null,
    );
  }
  return payload;
}
