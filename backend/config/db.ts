import './env';
import { Pool } from 'pg';

if (process.env.NODE_ENV === 'test' && (
	!/^collabflow_test_[a-f0-9]{24}$/.test(process.env.DB_DATABASE ?? '') ||
	process.env.DB_DATABASE !== process.env.COLLABFLOW_TEST_DATABASE
)) {
	throw new Error('Tests must use the disposable database created by Jest globalSetup');
}

export const databaseConfig =
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
		};

const pool = new Pool(databaseConfig);

export default pool;
