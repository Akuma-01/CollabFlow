export type StartupStage = 'database' | 'realtime' | 'http';

const schemaHint = 'Required database tables or columns are missing. Apply migrations 001 and 002 to the configured database and check its schema/search_path.';
const tlsHint = 'Database TLS certificate verification failed. Check the endpoint certificate chain and DB_SSL_CA_FILE; keep verification enabled.';
const networkHint = 'Database connection failed. Check the host, port, network access, and provider status. Supabase requires a reachable direct or session-pooler endpoint.';
const authHint = 'Database authentication failed. Check the configured database credentials and pooler username; percent-encode passwords in DATABASE_URL.';
const hints: Record<string, string> = {
	'42P01': schemaHint,
	'42703': schemaHint,
	'42501': 'Database access was denied. Check that the configured role can access the application schema and tables.',
	'28P01': authHint,
	'28000': authHint,
	'3D000': 'The configured database does not exist. Check the database name in the connection settings.',
	'53300': 'Database connection capacity is exhausted. Check provider connection limits and active API replicas.',
	'57P03': 'The database is not accepting connections yet. Check provider startup, maintenance, or recovery status.',
	'57014': 'The database startup query was cancelled. Check database load and statement timeouts.',
	'08P01': 'The database or pooler rejected the connection protocol. Check provider connection settings; LISTEN requires direct or session mode.',
	'0A000': 'The database endpoint does not support a required operation. LISTEN requires a direct or session-pooled connection.',
	'XX000': 'The database or pooler reported an internal error. Check provider logs and direct/session connection settings.',
	SELF_SIGNED_CERT_IN_CHAIN: tlsHint,
	DEPTH_ZERO_SELF_SIGNED_CERT: tlsHint,
	UNABLE_TO_VERIFY_LEAF_SIGNATURE: tlsHint,
	UNABLE_TO_GET_ISSUER_CERT_LOCALLY: tlsHint,
	CERT_HAS_EXPIRED: tlsHint,
	ERR_TLS_CERT_ALTNAME_INVALID: 'The database certificate does not match the configured host. Use the provider endpoint hostname and verify its certificate.',
	ECONNREFUSED: networkHint,
	ECONNRESET: networkHint,
	ETIMEDOUT: networkHint,
	ENETUNREACH: networkHint,
	EHOSTUNREACH: networkHint,
	ENOTFOUND: 'The database hostname could not be resolved. Check the configured host and provider DNS.',
	EAI_AGAIN: 'Database DNS lookup failed temporarily. Check DNS availability and retry.',
	EADDRINUSE: 'The HTTP port is already in use. Check PORT and ensure only one server binds it.',
	EACCES: 'The process was denied network or socket access. Check process permissions and the configured address and port.',
	CONNECTION_TIMEOUT: 'Database connection timed out. Check network access, provider availability, and connection capacity.',
	QUERY_TIMEOUT: 'The database startup query timed out. Check database load and that the endpoint supports persistent LISTEN subscriptions.',
};
const fallback: Record<StartupStage, string> = {
	database: 'Database validation failed. Check connectivity, verified TLS, credentials, and required migrations.',
	realtime: 'Notification listener startup failed. Use a direct or session-pooled database connection with capacity for a dedicated LISTEN client.',
	http: 'HTTP startup failed. Check the host-provided PORT and process permissions.',
};

function safeCode(error: unknown, depth = 0): string {
	if (!error || typeof error !== 'object' || depth > 4) return 'UNKNOWN';
	const value = error as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
	if (typeof value.code === 'string' && Object.prototype.hasOwnProperty.call(hints, value.code)) return value.code;
	// pg emits these timeouts without codes. Match only known literal messages;
	// never copy a driver's message, stack, host, query, or certificate details.
	if (['Connection terminated due to connection timeout', 'timeout exceeded when trying to connect', 'timeout expired'].includes(value.message as string)) {
		return 'CONNECTION_TIMEOUT';
	}
	if (value.message === 'Query read timeout') return 'QUERY_TIMEOUT';
	// Node can wrap connection errors in a cause or AggregateError. Limit traversal
	// so malformed/cyclic errors cannot prevent startup cleanup.
	const nested = [value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 8) : [])];
	for (const item of nested) {
		const code = safeCode(item, depth + 1);
		if (code !== 'UNKNOWN') return code;
	}
	return 'UNKNOWN';
}

export class StartupError extends Error {
	readonly code: string;
	constructor(readonly stage: StartupStage, error: unknown) {
		const code = safeCode(error);
		super(`API startup failed [${stage}/${code}]: ${hints[code] ?? fallback[stage]}`);
		this.name = 'StartupError';
		this.code = code;
		// Do not retain the original error as a cause: accidental serialization must
		// not expose database credentials or certificate/connection details.
	}
}

export function formatStartupFailure(error: unknown): string {
	return error instanceof StartupError ? error.message : 'API startup failed [unknown/UNKNOWN]: Review the runtime startup configuration.';
}
