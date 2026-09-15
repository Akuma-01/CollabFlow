import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'node:fs';

// Tests receive isolated credentials from Jest; deployed environment values win
// over local .env defaults.
export function loadBackendEnv(configDirectory = __dirname): void {
	// Source lives in config/, the compiled module in dist/config/. Resolve the
	// package root instead of relying on the shell's working directory.
	const parent = path.resolve(configDirectory, '..');
	const root = existsSync(path.join(parent, 'package.json')) ? parent : path.dirname(parent);
	dotenv.config({ path: path.join(root, '.env'), quiet: true });
}

if (process.env.NODE_ENV !== 'test') loadBackendEnv();
