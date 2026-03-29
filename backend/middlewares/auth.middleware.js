const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader) {
			return next({ status: 401, message: "No token provided" });
		}

		// extract bearer token
		const parts = authHeader.split(" ");

		if (parts.length != 2 || parts[0] !== "Bearer") {
			return next({ status: 401, message: "Invalid token format" })
		}

		const token = parts[1];

		// verufy token
		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		// attach decoded user to req.user
		req.user = decoded;

		next();
	} catch (err) {
		return next({ status: 401, message: "Invalid or expired token" })
	}
}

module.exports = authMiddleware;
