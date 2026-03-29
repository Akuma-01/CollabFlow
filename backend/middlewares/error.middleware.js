const errorMiddleware = (err, req, res, next) => {
	if (err.message === "EMAIL_EXISTS") {
		return res.status(400).json({
			success: false,
			message: "Email already exists"
		})
	}

	if (err.code === "23503") {
		return res.status(400).json({
			success: false,
			message: "Cannot perform this action due to existing dependencies"
		});
	}

	if (err.code === "23514") {
		return res.status(400).json({
			success: false,
			message: "Invalid status value"
		});
	}

	res.status(err.status || 500).json({
		success: false,
		message: err.message || "Internal Server Error"
	});
};

module.exports = errorMiddleware;
