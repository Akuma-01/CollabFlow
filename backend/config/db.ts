import './env';
import { Pool } from 'pg';
import { readDatabaseConfig } from './database';

export const databaseConfig = readDatabaseConfig();

const pool = new Pool(databaseConfig);
// Idle clients can fail during a database restart. pg discards the client; an
// error listener keeps the process alive so later requests can reconnect.
pool.on('error', () => console.error('Idle PostgreSQL connection lost'));

export default pool;
