const authService = require("../services/auth.service")

const registerUser = async (req, res, next) => {
	const { name, email, password } = req.body;

	if (!name || typeof name !== 'string') {
		return next({ status: 400, message: "Valid name is required" });
	}
	if (!email || typeof email !== 'string' || !email.includes("@")) {
		return next({ status: 400, message: "Valid email is required" });
	}
	if (!password || typeof password !== 'string') {
		return next({ status: 400, message: "Valid password is required" });
	}

	try {
		const result = await authService.registerUser(name, email, password);

		return res.status(201).json({
			success: true,
			data: result
		})
	} catch (err) {

		next(err);
	}
}

const loginUser = async (req, res, next) => {
	const { email, password } = req.body;

	if (!email || !email.includes('@') || typeof email !== "string") {
		return next({ status: 400, message: "Correct email ID is required" });
	}

	if (!password || typeof password !== "string") {
		return next({ status: 400, message: "Correct password ID is required" });
	}

	try {
		const result = await authService.loginUser(email, password);

		return res.status(200).json({
			success: true,
			data: result
		})

	} catch (err) {
		next(err);
	}

}

module.exports = {
	registerUser, loginUser
}
