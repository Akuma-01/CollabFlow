const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
	getUsers,
	createUser,
	deleteUser
} = require("../controllers/users.controller");

router.get("/", getUsers);

module.exports = router;
