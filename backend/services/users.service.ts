import pool from '../config/db';
import { User } from '../types';

export const getAllUsers = async (): Promise<User[]> => {
	const result = await pool.query('SELECT id, name, email FROM users ORDER BY id ASC');
	return result.rows;
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



