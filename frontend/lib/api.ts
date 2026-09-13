class ApiError extends Error {
	constructor(message: string, public status: number) {
		super(message);
		this.name = 'ApiError';
	}
}

export function createApiClient(
	baseUrl: string,
	fetcher: typeof fetch = globalThis.fetch,
	locks: { request<T>(name: string, operation: () => Promise<T>): Promise<T> } | undefined =
		typeof navigator !== 'undefined' ? navigator.locks : undefined,
) {
	let refreshPromise: Promise<void> | null = null;
	let authQueue: Promise<unknown> = Promise.resolve();

	function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
		// Web Locks coordinate cookie-changing requests across same-origin tabs.
		// The queue provides same-tab serialization in browsers without Web Locks.
		if (locks) return locks.request(`collabflow-auth:${baseUrl}`, operation);
		const result = authQueue.then(operation, operation);
		authQueue = result.catch(() => {});
		return result;
	}

	async function decode<T>(res: Response): Promise<T> {
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new ApiError(data?.message || 'Something went wrong', res.status);
		return data;
	}

	function refreshSession(): Promise<void> {
		if (!refreshPromise) {
			refreshPromise = withSessionLock(async () => {
				// A parallel request or another tab may already have refreshed. Check
				// again under the lock before consuming the current refresh cookie.
				const current = await fetcher(`${baseUrl}/auth/me`, { credentials: 'include', cache: 'no-store' });
				if (current.ok) return;
				if (current.status !== 401) { await decode(current); return; }
				const refreshed = await fetcher(`${baseUrl}/auth/refresh`, {
					method: 'POST', credentials: 'include', cache: 'no-store',
				});
				await decode(refreshed);
			}).finally(() => { refreshPromise = null; });
		}
		return refreshPromise;
	}

	async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const send = () => fetcher(`${baseUrl}${path}`, {
			method,
			credentials: 'include',
			cache: 'no-store',
			...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
		});
		// Login/logout must not race a refresh response that changes shared cookies.
		if (path === '/auth/login' || path === '/auth/logout' || path === '/auth/refresh') {
			return withSessionLock(async () => decode<T>(await send()));
		}
		const res = await send();
		// /auth/me is used by pages to restore a browser session on load.
		if (res.status === 401 && (!path.startsWith('/auth/') || path === '/auth/me')) {
			await refreshSession();
			return decode<T>(await send()); // Retry the original request at most once.
		}
		return decode<T>(res);
	}

	return {
		get: <T>(path: string) => request<T>('GET', path),
		post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
		patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
		delete: <T>(path: string) => request<T>('DELETE', path),
	};
}

export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL!);
export { ApiError };
