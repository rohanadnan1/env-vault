import useSWR, { SWRConfiguration } from 'swr';

export const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5000,
  errorRetryCount: 3,
  errorRetryInterval: 2000,
  focusThrottleInterval: 10000,
  loadingTimeout: 3000,
};

export async function apiFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export function useApi<T = unknown>(url: string | null, config?: SWRConfiguration) {
  return useSWR<T>(url, apiFetcher, { ...defaultConfig, ...config });
}
