const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

module.exports = async () => {
  const defaults = dotenv.parse(readFileSync(path.join(__dirname, '..', '.env.test')));
  const setting = name => process.env[name] ?? defaults[name];
  // Only explicit TEST_DB_* settings can select the test server. Application
  // DATABASE_URL/DB_* credentials are never used to create or clean up test data.
  const connection = {
    host: setting('TEST_DB_HOST'),
    port: Number(setting('TEST_DB_PORT')),
    user: setting('TEST_DB_USER'),
    password: setting('TEST_DB_PASSWORD'),
    connectionTimeoutMillis: 5000,
  };
  const database = `collabflow_test_${randomBytes(12).toString('hex')}`;
  const admin = new Client({ ...connection, database: 'postgres' });
  let created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const client = new Client({ ...connection, database });
    try {
      await client.connect();
      await client.query(readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    } finally {
      await client.end();
    }

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_HOST: connection.host,
      DB_PORT: String(connection.port),
      DB_USER: connection.user,
      DB_PASSWORD: connection.password,
      DB_DATABASE: database,
      COLLABFLOW_TEST_DATABASE: database,
    });
    // Jest shares globals between globalSetup and globalTeardown, not test files.
    globalThis.__collabflowTestDatabase = { connection, database };
  } catch (error) {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    throw error;
  } finally {
    await admin.end();
  }
};
