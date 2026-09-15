import './env';

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
	const production = env.NODE_ENV === 'production';
	function integer(name: string, fallback: number, min: number, max: number) {
		const value = env[name] ?? String(fallback);
		if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
			throw new Error(`${name} must be an integer between ${min} and ${max}`);
		}
		return Number(value);
	}
	for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
		if (!env[name]?.trim() || (production && env[name]!.length < 32)) {
			throw new Error(`${name} is required${production ? ' and must contain at least 32 characters' : ''}`);
		}
	}
	if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must differ');
	let frontend: URL;
	try { frontend = new URL(env.FRONTEND_URL ?? (production ? '' : 'http://localhost:3001')); }
	catch { throw new Error('FRONTEND_URL must be an absolute browser origin'); }
	if (!['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password ||
		frontend.pathname !== '/' || frontend.search || frontend.hash || (production && frontend.protocol !== 'https:')) {
		throw new Error('FRONTEND_URL must be a browser origin without a path or credentials; production requires HTTPS');
	}
	return {
		port: integer('PORT', 3000, 1, 65535),
		trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 10),
		frontendOrigin: frontend.origin,
	};
}

export const runtimeConfig = readRuntimeConfig();
