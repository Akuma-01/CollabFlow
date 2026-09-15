import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
	...base,
	testDir: './e2e-live',
	workers: 1,
	webServer: [
		{
			command: 'npm --prefix ../backend run build && node e2e-live/server.mjs',
			url: 'http://127.0.0.1:4319/health/ready',
			stdout: 'pipe',
			reuseExistingServer: false,
			timeout: 60_000,
			gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
		},
		...(Array.isArray(base.webServer) ? base.webServer : [base.webServer!]),
	],
});
