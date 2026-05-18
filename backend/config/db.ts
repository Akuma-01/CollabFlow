import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({
	path: path.resolve(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
	override: true,
});

const pool = new Pool(
	process.env.DATABASE_URL && process.env.NODE_ENV !== 'test'
		? {
			connectionString: process.env.DATABASE_URL,
			ssl: { rejectUnauthorized: false },
		}
		: {
			user: process.env.DB_USER,
			host: process.env.DB_HOST,
			database: process.env.DB_DATABASE,
			password: process.env.DB_PASSWORD,
			port: Number(process.env.DB_PORT),
		}
);

export default pool;
