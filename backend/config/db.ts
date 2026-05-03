import { Pool } from 'pg';

const pool = new Pool(
	process.env.DATABASE_URL
		? {
			connectionString: process.env.DATABASE_URL,
			ssl: { rejectUnauthorized: false }
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
