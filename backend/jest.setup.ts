process.env.NODE_ENV = 'test';
// Override DATABASE_URL so pg uses local credentials instead
delete process.env.DATABASE_URL;
