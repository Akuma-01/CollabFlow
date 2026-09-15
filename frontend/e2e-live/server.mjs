import { createRequire } from 'node:module';

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const setup = backendRequire('./test/global-setup.cjs');
const teardown = backendRequire('./test/global-teardown.cjs');
Object.assign(process.env, {
	NODE_ENV: 'test', FRONTEND_URL: 'http://127.0.0.1:3100',
	JWT_SECRET: 'browser-test-access-secret', JWT_REFRESH_SECRET: 'browser-test-refresh-secret',
});
delete process.env.DATABASE_URL;

let runtime, pool, closing = false;
async function stop() {
	if (closing) return;
	closing = true;
	const deadline = setTimeout(() => process.exit(1), 9000);
	try {
		await runtime?.close();
		await pool?.end();
		await teardown();
	} finally { clearTimeout(deadline); }
}

try {
	// Uses only TEST_DB_* settings and drops only its randomly named test DB.
	await setup();
	pool = backendRequire('./dist/config/db').default;
	runtime = await backendRequire('./dist/runtime/server').startHttpServer(
		backendRequire('./dist/server').default, { port: 4319, host: '127.0.0.1' },
	);
	process.once('SIGTERM', () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
	process.once('SIGINT', () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
} catch (error) {
	console.error(error);
	await stop();
	process.exitCode = 1;
}
