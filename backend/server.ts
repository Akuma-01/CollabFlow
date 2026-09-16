import cookieParser from "cookie-parser";
import cors from "cors";
import './config/env';

import express from 'express';
import helmet from "helmet";
import errorMiddleware from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import projectRoutes from './routes/projects.routes';
import taskRoutes from './routes/tasks.routes';
import userRoutes from './routes/users.routes';
import pool from './config/db';
import { runtimeConfig } from './config/runtime';
import { installHealthRoutes } from './runtime/health';
import { startHttpServer } from './runtime/server';
import { formatStartupFailure } from './runtime/startup-error';

export function createApp() {
	const app = express();

	app.use(helmet());

	app.set('trust proxy', runtimeConfig.trustProxyHops);
	app.use(cors({
		origin: runtimeConfig.frontendOrigin,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
		credentials: true
	}));

	app.use(express.json());
	app.use(cookieParser());
	app.locals.health = installHealthRoutes(app);

	app.get("/", (req, res) => {
		res.send("API running 🚀");
	});

	app.use("/users", userRoutes);
	app.use("/projects", projectRoutes);
	app.use("/auth", authRoutes);
	app.use("/projects", taskRoutes);
	app.use("/dashboard", dashboardRoutes);
	app.use(errorMiddleware);
	return app;
}

const app = createApp();
export default app;

if (require.main === module) {
	void startHttpServer(app).then(runtime => {
		console.log(`Server listening on port ${runtimeConfig.port}`);
		let closing = false;
		const shutdown = async () => {
			if (closing) return;
			closing = true;
			const deadline = setTimeout(() => process.exit(1), 10_000);
			deadline.unref();
			await runtime.close();
			await pool.end();
			clearTimeout(deadline);
		};
		const stop = () => { void shutdown().catch(() => { console.error('Server shutdown failed'); process.exitCode = 1; }); };
		process.once('SIGTERM', stop);
		process.once('SIGINT', stop);
	}).catch(async error => {
		console.error(formatStartupFailure(error));
		await pool.end();
		process.exitCode = 1;
	});
}
