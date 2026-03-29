const pool = require('../config/db');

const getAllUsers = async () => {
	const result = await pool.query("SELECT * FROM users ORDER BY id ASC");
	return result.rows;
}

module.exports = {
	getAllUsers,
};
/*	WITHOUT USING DB

	let users = [];

	// Get all users
	const getAllUsers = () => {
		return users;
	};

	// Create user
	const createUser = (data) => {
		const newUser = {
			id: Date.now(),
			...data
		};

		users.push(newUser);
		return newUser;
	};

	// Delete user
	const deleteUserById = (id) => {
		const index = users.findIndex(u => u.id === id);

		if (index === -1) {
			return null;
		}

		users.splice(index, 1);
		return true;
	};


*/



