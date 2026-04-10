import './config/env';

import express from 'express';
import errorMiddleware from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/projects.routes';
import taskRoutes from './routes/tasks.routes';
import userRoutes from './routes/users.routes';

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
	res.send("API running 🚀");
});

app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/auth", authRoutes);
app.use("/projects", taskRoutes);
app.use(errorMiddleware);

app.listen(3000, () => {
	console.log("server running");
})

