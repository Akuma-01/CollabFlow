export default {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	clearMocks: true,
	setupFiles: ['<rootDir>/jest.setup.ts'],
	globalSetup: '<rootDir>/test/global-setup.cjs',
	globalTeardown: '<rootDir>/test/global-teardown.cjs',
	maxWorkers: 1,
};
