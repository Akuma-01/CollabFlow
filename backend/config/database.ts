import { readFileSync } from 'node:fs';
import { PoolConfig } from 'pg';

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
	const test = env.NODE_ENV === 'test';
	if (test && (!/^collabflow_test_[a-f0-9]{24}$/.test(env.DB_DATABASE ?? '') || env.DB_DATABASE !== env.COLLABFLOW_TEST_DATABASE)) {
		throw new Error('Tests must use the disposable database created by Jest globalSetup');
	}
	const connectionString = !test && env.DATABASE_URL ? env.DATABASE_URL : undefined;
	if (connectionString) {
		let url: URL;
		try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL'); }
		if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
			throw new Error('DATABASE_URL must specify a PostgreSQL host and database');
		}
		// pg's URL parser overrides an explicit ssl object if these are present.
		if (['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'].some(key => url.searchParams.has(key))) {
			throw new Error('Configure TLS with DB_SSL_MODE and DB_SSL_CA_FILE; remove SSL parameters from DATABASE_URL');
		}
	} else {
		for (const key of ['DB_HOST', 'DB_USER', 'DB_DATABASE']) {
			if (!env[key]?.trim()) throw new Error(`${key} is required when DATABASE_URL is not set`);
		}
	}
	const port = env.DB_PORT ?? '5432';
	if (!connectionString && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
		throw new Error('DB_PORT must be an integer between 1 and 65535');
	}
	const mode = test ? 'disable' : env.DB_SSL_MODE ?? (connectionString ? 'verify-full' : 'disable');
	if (!['disable', 'verify-full'].includes(mode)) throw new Error('DB_SSL_MODE must be disable or verify-full');
	let ca: string | undefined;
	if (!test && env.DB_SSL_CA_FILE) {
		if (mode !== 'verify-full') throw new Error('DB_SSL_CA_FILE requires DB_SSL_MODE=verify-full');
		try { ca = readFileSync(env.DB_SSL_CA_FILE, 'utf8'); }
		catch { throw new Error('DB_SSL_CA_FILE could not be read'); }
	}
	return {
		...(connectionString ? { connectionString } : {
			host: env.DB_HOST, user: env.DB_USER, database: env.DB_DATABASE,
			password: env.DB_PASSWORD, port: Number(port),
		}),
		ssl: mode === 'verify-full' ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
		connectionTimeoutMillis: 5000,
		statement_timeout: 10_000,
		idle_in_transaction_session_timeout: 10_000,
		keepAlive: true,
	};
}
