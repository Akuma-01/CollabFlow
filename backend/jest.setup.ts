process.env.NODE_ENV = 'test';
// Credentials and the unique database name come from globalSetup. Never load .env.
delete process.env.DATABASE_URL;
process.env.JWT_SECRET = 'collabflow-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'collabflow-test-refresh-secret';
