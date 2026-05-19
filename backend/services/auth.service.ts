import bcrypt from 'bcrypt';
import pool from '../config/db';
import { User } from '../types';
import { AppError } from '../utils/AppError';

export const registerUser = async (
	name: string,
	email: string,
	password: string
): Promise<Pick<User, 'id' | 'name' | 'email'>> => {

	const hashedPassword = await bcrypt.hash(password, 10);

	const result = await pool.query(
		"INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
		[name, email, hashedPassword]
	);

	return result.rows[0];
}

export const loginUser = async (
	email: string,
	password: string
): Promise<{ user: Pick<User, 'id' | 'name' | 'email'> }> => {

	const result = await pool.query(
		"SELECT id, name, email, password FROM users WHERE email = $1", [email]
	);

	if (result.rows.length === 0) {
		throw new AppError('Invalid email or password', 400);
	}

	const user = result.rows[0];

	const isMatch = await bcrypt.compare(password, user.password as string);

	if (!isMatch) {
		throw new AppError('Invalid email or password', 400);
	}

	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email
		}
	}
}
