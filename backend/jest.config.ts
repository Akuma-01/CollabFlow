export default {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	clearMocks: true,
	setupFiles: ['<rootDir>/jest.setup.ts'],
	maxWorkers: 1,
};
