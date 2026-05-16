import pool from '../config/db';
import { User } from '../types';

export const searchUsers = async (query: string): Promise<Pick<User, 'id' | 'name' | 'email'>[]> => {
	const result = await pool.query(
		`SELECT id, name, email FROM users
			WHERE email ILIKE $1 OR name ILIKE $1
			ORDER BY email ASC
			LIMIT 10`,
		[`%${query}%`]
	);

	return result.rows;
};

export const isUser = async (user_id: number): Promise<boolean> => {
	const result = await pool.query('SELECT 1 FROM users WHERE id = $1', [user_id]);
	return result.rows.length > 0;
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



