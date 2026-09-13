const { Client } = require('pg');

module.exports = async () => {
  const state = globalThis.__collabflowTestDatabase;
  if (!state) return;
  const { connection, database } = state;
  if (!/^collabflow_test_[a-f0-9]{24}$/.test(database)) {
    throw new Error('Refusing to drop an unexpected database');
  }
  const admin = new Client({ ...connection, database: 'postgres' });
  try {
    await admin.connect();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};
