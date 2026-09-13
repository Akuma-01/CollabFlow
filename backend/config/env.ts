import dotenv from 'dotenv';
import path from 'path';

// Tests receive isolated credentials from Jest; deployed environment values win
// over local .env defaults.
if (process.env.NODE_ENV !== 'test') {
	dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}
