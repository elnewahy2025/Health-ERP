import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { VERSION_HEADER, API_VERSION } from "./versioning";

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true, // Send cookies cross-origin
});

// Store access token in memory only (not localStorage)
let inMemoryAccessToken: string | null = null;
// CSRF token from the login/refresh response body — echoed back as a header
let inMemoryCsrfToken: string | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tenantSlug = localStorage.getItem('tenantSlug');
    if (inMemoryAccessToken && config.headers) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
      config.headers[VERSION_HEADER] = API_VERSION;
    }
    if (tenantSlug && config.headers) {
      config.headers['X-Tenant-Slug'] = tenantSlug;
    }
    if (inMemoryCsrfToken && config.headers) {
      config.headers['x-csrf-token'] = inMemoryCsrfToken;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Remember whether we had a live token: only hard-redirect on refresh failure
      // when a real session expired mid-use. Anonymous 401s (first load, login page)
      // still attempt a cookie-based refresh for session restore, and reject cleanly
      // if there is no session, so the router can render /login without a reload loop.
      const hadToken = Boolean(inMemoryAccessToken);
      // Anonymous auth endpoints must surface their own errors: there is no session
      // cookie to refresh, and attempting one replaces e.g. "Invalid email or
      // password" with the refresh route's "Missing refresh token" message.
      const url = originalRequest.url || '';
      const isAnonymousAuthCall =
        !hadToken &&
        [
          '/auth/login',
          '/auth/register',
          '/auth/mfa/verify',
          '/auth/forgot-password',
          '/auth/reset-password',
          '/auth/otp/send',
          '/auth/otp/verify',
          '/tenants',
        ].some((path) => url.includes(path));
      if (isAnonymousAuthCall) {
        return Promise.reject(error);
      }
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          inMemoryAccessToken = token;
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh token is in HttpOnly cookie — sent automatically with withCredentials
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
          withCredentials: true,
        });

        const { accessToken, csrfToken } = response.data.data;
        inMemoryAccessToken = accessToken;
        if (csrfToken) inMemoryCsrfToken = csrfToken;
        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        inMemoryAccessToken = null;
        inMemoryCsrfToken = null;
        localStorage.removeItem('tenantSlug');
        localStorage.removeItem('locale');
        if (hadToken) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
