const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(
	method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
	path: string,
	body?: unknown
): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});

	if (res.status === 401 && path !== '/auth/refresh') {
		const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
			method: 'POST',
			credentials: 'include',
		});

		if (refreshRes.ok) {
			const retry = await fetch(`${BASE_URL}${path}`, {
				method,
				headers: { "Content-type": "application/json" },
				credentials: "include",
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});

			const retryData = await retry.json().catch(() => ({}));
			if (!retry.ok) {
				throw new ApiError(retryData?.message || "Something went wrong", retry.status);
			}

			return retryData;
		}
	}

	const data = await res.json().catch(() => ({}));

	if (!res.ok) {
		throw new ApiError(
			data?.message || "Something went wrong",
			res.status
		);
	}

	return data;
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
	patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
	delete: <T>(path: string) => request<T>("DELETE", path),
};

export { ApiError };
