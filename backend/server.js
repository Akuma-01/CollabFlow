require('./config/env');

const express = require('express');
const app = express();
const errorMiddleware = require("./middlewares/error.middleware");

const projectRoutes = require("./routes/projects.routes")
const userRoutes = require("./routes/users.routes")
const authRoutes = require("./routes/auth.routes")
const taskRoutes = require("./routes/tasks.routes")

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

