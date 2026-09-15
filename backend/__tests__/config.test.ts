import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRuntimeConfig } from '../config/runtime';
import { readDatabaseConfig } from '../config/database';
import { loadBackendEnv } from '../config/env';

const production = {
	NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32),
	FRONTEND_URL: 'https://app.example.test',
};

describe('Runtime configuration', () => {
	it('uses the assigned port and normalizes one origin for HTTP and WebSockets', () => {
		expect(readRuntimeConfig({ ...production, PORT: '4319', TRUST_PROXY_HOPS: '1', FRONTEND_URL: 'https://app.example.test/' }))
			.toEqual({ port: 4319, trustProxyHops: 1, frontendOrigin: 'https://app.example.test' });
	});
	it('trusts no forwarding headers by default', () => {
		expect(readRuntimeConfig(production).trustProxyHops).toBe(0);
	});
	it.each(['', '0', '65536', '3000x', 'NaN', '1.5'])('rejects invalid PORT %p', PORT => {
		expect(() => readRuntimeConfig({ ...production, PORT })).toThrow('PORT');
	});
	it.each(['true', '-1', '1.5'])('rejects invalid proxy hop count %p', TRUST_PROXY_HOPS => {
		expect(() => readRuntimeConfig({ ...production, TRUST_PROXY_HOPS })).toThrow('TRUST_PROXY_HOPS');
	});
	it.each([undefined, 'http://app.test', 'https://app.test/path', 'https://user:secret@app.test', 'https://app.test?q=secret'])
	('rejects unsafe production browser origins without printing their contents', FRONTEND_URL => {
		let message = '';
		try { readRuntimeConfig({ ...production, FRONTEND_URL }); } catch (error) { message = (error as Error).message; }
		expect(message).toContain('FRONTEND_URL');
		expect(message).not.toContain('secret');
	});
	it('rejects missing, short, or shared signing keys', () => {
		expect(() => readRuntimeConfig({ ...production, JWT_SECRET: undefined })).toThrow('JWT_SECRET');
		expect(() => readRuntimeConfig({ ...production, JWT_REFRESH_SECRET: 'short' })).toThrow('JWT_REFRESH_SECRET');
		expect(() => readRuntimeConfig({ ...production, JWT_REFRESH_SECRET: production.JWT_SECRET })).toThrow('must differ');
	});
});

describe('Database configuration', () => {
	const remote = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:private-password@db.test/collabflow' };
	it('verifies TLS for URL connections and bounds connection/query waits', () => {
		expect(readDatabaseConfig(remote)).toMatchObject({
			ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 5000, statement_timeout: 10_000,
		});
	});
	it('supports explicit plaintext on a private network and discrete local settings', () => {
		expect(readDatabaseConfig({ ...remote, DB_SSL_MODE: 'disable' }).ssl).toBe(false);
		expect(readDatabaseConfig({ DB_HOST: 'localhost', DB_USER: 'postgres', DB_DATABASE: 'collabflow' }))
			.toMatchObject({ port: 5432, ssl: false });
	});
	it.each(['sslmode=require', 'ssl=no-verify', 'sslrootcert=private.pem', 'uselibpqcompat=true'])
	('rejects URL parameters that could override configured TLS: %s', parameter => {
		expect(() => readDatabaseConfig({ ...remote, DATABASE_URL: `${remote.DATABASE_URL}?${parameter}` })).toThrow('remove SSL parameters');
	});
	it('rejects malformed settings without logging database credentials', () => {
		expect(() => readDatabaseConfig({ ...remote, DATABASE_URL: 'invalid-private-password' })).toThrow('DATABASE_URL must be');
		expect(() => readDatabaseConfig({ ...remote, DB_SSL_MODE: 'no-verify' })).toThrow('DB_SSL_MODE');
		expect(() => readDatabaseConfig({ DB_HOST: 'localhost' })).toThrow('DB_USER');
		expect(() => readDatabaseConfig({ DB_HOST: 'localhost', DB_USER: 'postgres', DB_DATABASE: 'test', DB_PORT: 'broken' })).toThrow('DB_PORT');
	});
	it('keeps test isolation even when application URL and TLS settings are present', () => {
		const name = `collabflow_test_${'a'.repeat(24)}`;
		expect(readDatabaseConfig({ ...remote, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_USER: 'postgres',
			DB_DATABASE: name, COLLABFLOW_TEST_DATABASE: name, DB_SSL_CA_FILE: '/missing' }))
			.toMatchObject({ host: '127.0.0.1', database: name, ssl: false });
		expect(() => readDatabaseConfig({ ...remote, NODE_ENV: 'test', DB_DATABASE: 'real-data' })).toThrow('disposable database');
	});
});

describe('Source and compiled environment loading', () => {
	it('loads the package .env from either directory and preserves deployed values', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'collabflow-env-'));
		const key = 'COLLABFLOW_ENV_FIXTURE';
		const previous = process.env[key];
		try {
			mkdirSync(path.join(root, 'config'));
			mkdirSync(path.join(root, 'dist', 'config'), { recursive: true });
			writeFileSync(path.join(root, 'package.json'), '{}');
			writeFileSync(path.join(root, '.env'), `${key}=from-file\n`);
			for (const directory of ['config', 'dist/config']) {
				delete process.env[key];
				loadBackendEnv(path.join(root, directory));
				expect(process.env[key]).toBe('from-file');
				process.env[key] = 'from-host';
				loadBackendEnv(path.join(root, directory));
				expect(process.env[key]).toBe('from-host');
			}
			writeFileSync(path.join(root, 'ca.pem'), 'test-ca');
			expect(readDatabaseConfig({ DATABASE_URL: 'postgres://u:p@db.test/db', DB_SSL_CA_FILE: path.join(root, 'ca.pem') }).ssl)
				.toEqual({ rejectUnauthorized: true, ca: 'test-ca' });
		} finally {
			if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
