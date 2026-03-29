const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware")

const { registerUser, loginUser } = require("../controllers/auth.controller")

router.post("/register", registerUser);
router.post("/login", loginUser);

router.get("/me", authMiddleware, (req, res) => {
	res.json({
		success: true,
		data: req.user
	})
})

module.exports = router;
