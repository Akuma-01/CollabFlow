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
import { createServer } from 'node:http';
import { startProjectRealtime } from './realtime/server';
import pool from './config/db';

const app = express();

app.use(helmet());

app.set('trust proxy', 1);
app.use(cors({
	origin: process.env.FRONTEND_URL || "http://localhost:3001",
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
	credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
	res.send("API running 🚀");
});

app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/auth", authRoutes);
app.use("/projects", taskRoutes);
app.use("/dashboard", dashboardRoutes);
app.use(errorMiddleware);

export default app;

if (require.main === module) {
	const server = createServer(app);
	void startProjectRealtime(server).then(realtime => {
		server.listen(3000, '0.0.0.0', () => console.log('Server running on http://0.0.0.0:3000'));
		let closing = false;
		const shutdown = async () => {
			if (closing) return;
			closing = true;
			const deadline = setTimeout(() => process.exit(1), 10_000);
			deadline.unref();
			const drained = new Promise<void>(resolve => server.close(() => resolve()));
			await realtime.close();
			await drained;
			await pool.end();
			clearTimeout(deadline);
		};
		process.once('SIGTERM', () => { void shutdown(); });
		process.once('SIGINT', () => { void shutdown(); });
	}).catch(async () => {
		console.error('Could not start the project notification listener');
		await pool.end();
		process.exitCode = 1;
	});
}
