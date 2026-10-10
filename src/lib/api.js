export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://api.pioneerlegacyworks.com'
).replace(/\/$/, '');

const EMPLOYEE_SESSION_KEY = 'pioneer.employee.session.v1';
let memorySession = null;

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function validSession(candidate) {
  return candidate &&
    typeof candidate.token === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(candidate.token) &&
    typeof candidate.expiresAt === 'string' &&
    new Date(candidate.expiresAt).getTime() > Date.now() + 5000;
}

export function getEmployeeSessionToken() {
  if (validSession(memorySession)) return memorySession.token;
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (validSession(parsed)) {
      memorySession = parsed;
      return parsed.token;
    }
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
  } catch {
    // Private browsing can block storage. An in-memory session still works
    // until this tab reloads.
  }
  memorySession = null;
  return null;
}

export function saveEmployeeSession(token, expiresAt) {
  const candidate = { token, expiresAt };
  if (!validSession(candidate)) throw new ApiError(
    'The login response contained an invalid or expired employee session.',
    500, 'INVALID_EMPLOYEE_SESSION'
  );
  memorySession = candidate;
  try {
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(candidate));
  } catch {
    // Login still functions with memory-only credentials.
  }
}

export function clearEmployeeSession() {
  memorySession = null;
  try { sessionStorage.removeItem(EMPLOYEE_SESSION_KEY); } catch { /* private mode */ }
}

function prepareRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : '/'+path}`;
  const headers = new Headers(options.headers || {});
  const employeeRequest = path.startsWith('/api/employee/');
  const token = employeeRequest && path !== '/api/employee/session/login'
    ? getEmployeeSessionToken() : null;
  if (token) headers.set('Authorization', 'Bearer '+token);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { url, init: {
    ...options, headers,
    // Safari rejects the third-party session cookie for this site's API.
    // On employee routes, use the narrow bearer session instead.
    credentials: token ? 'omit' : 'include',
    cache: employeeRequest ? 'no-store' : (options.cache || 'default'),
  } };
}

async function request(path, options = {}, binary = false) {
  const { url, init } = prepareRequest(path, options);
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(
      'Could not connect to the Pioneer API. Check your network or ask a manager.',
      0, 'CONNECTION_ERROR'
    );
  }
  if (response.ok && binary) return response.blob();

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

export function apiRequest(path, options = {}) {
  return request(path, options);
}

export function apiBinaryRequest(path, options = {}) {
  return request(path, options, true);
}
