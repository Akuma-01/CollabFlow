import { formatStartupFailure, StartupError } from '../runtime/startup-error';

describe('Safe startup diagnostics', () => {
	it('identifies a missing schema without retaining raw database details', () => {
		const error = Object.assign(new Error('private table on postgres://user:secret@private-host/db'), {
			code: '42P01', detail: 'private query and database name',
		});
		const failure = new StartupError('database', error);
		expect(failure).toMatchObject({ stage: 'database', code: '42P01' });
		expect(formatStartupFailure(failure)).toContain('[database/42P01]');
		expect(failure.message).toContain('migrations 001 and 002');
		expect(`${failure.stack} ${JSON.stringify(failure)}`).not.toMatch(/private|secret|postgres:\/\//);
		expect(failure).not.toHaveProperty('cause');
	});

	it('reports a certificate failure without logging certificate or connection fields', () => {
		const failure = new StartupError('database', {
			code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'private certificate', host: 'private-host',
			cert: { subject: 'private subject' }, connectionString: 'postgres://user:secret@host/db',
		});
		expect(failure.message).toContain('[database/SELF_SIGNED_CERT_IN_CHAIN]');
		expect(failure.message).toContain('DB_SSL_CA_FILE');
		expect(`${failure.stack} ${JSON.stringify(failure)}`).not.toMatch(/private|secret|postgres:\/\//);
	});

	it('recognizes wrapped and aggregate network failures', () => {
		const failure = new StartupError('realtime', {
			message: 'private wrapper', cause: { errors: [{ message: 'private unknown' }, { code: 'ENETUNREACH', address: 'private-ip' }] },
		});
		expect(failure.code).toBe('ENETUNREACH');
		expect(failure.message).toContain('[realtime/ENETUNREACH]');
		expect(failure.message).not.toContain('private');
	});

	it.each([
		['Connection terminated due to connection timeout', 'CONNECTION_TIMEOUT'],
		['timeout exceeded when trying to connect', 'CONNECTION_TIMEOUT'],
		['timeout expired', 'CONNECTION_TIMEOUT'],
		['Query read timeout', 'QUERY_TIMEOUT'],
	])('classifies the driver timeout %s', (message, code) => {
		expect(new StartupError('database', new Error(message)).code).toBe(code);
	});

	it('drops unknown codes, messages, and cyclic causes', () => {
		const error: { code: string; message: string; cause?: unknown } = { code: 'secret-code', message: 'private database password' };
		error.cause = error;
		const failure = new StartupError('realtime', error);
		expect(failure.code).toBe('UNKNOWN');
		expect(failure.message).toContain('[realtime/UNKNOWN]');
		expect(failure.message).toContain('dedicated LISTEN client');
		expect(failure.message).not.toMatch(/secret|private/);
	});

	it('treats inherited object property names as unknown codes', () => {
		expect(new StartupError('http', { code: 'constructor' }).code).toBe('UNKNOWN');
	});

	it('does not log an unexpected thrown value', () => {
		for (const error of [new Error('private credentials'), 'private credentials', null, undefined]) {
			expect(formatStartupFailure(error)).toBe('API startup failed [unknown/UNKNOWN]: Review the runtime startup configuration.');
		}
	});
});
