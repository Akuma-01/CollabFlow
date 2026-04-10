import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { User } from '../types';

export const registerUser = async (
	name: string,
	email: string,
	password: string
): Promise<Pick<User, 'id' | 'name' | 'email'>> => {
	const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

	if (existing.rows.length > 0) {
		throw new Error("EMAIL_EXISTS");
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	try {
		const result = await pool.query(
			"INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
			[name, email, hashedPassword]
		);

		return result.rows[0];

	} catch (err: any) {
		if (err.code === "23505") {
			throw new Error("EMAIL_EXISTS");
		}
		throw err;
	}
}

export const loginUser = async (
	email: string,
	password: string
): Promise<{ token: string, user: Pick<User, 'id' | 'name' | 'email'> }> => {

	const result = await pool.query(
		"SELECT id, name, email, password FROM users WHERE email = $1", [email]
	);

	if (result.rows.length === 0) {
		throw { status: 400, message: "Invalid email" };
	}

	const user = result.rows[0];

	const isMatch = await bcrypt.compare(password, user.password as string);

	if (!isMatch) {
		throw { status: 400, message: "Invalid password" };
	}

	const token = jwt.sign(
		{ id: user.id, email: user.email },
		process.env.JWT_SECRET as string,
		{ expiresIn: "1h" }
	);

	return {
		token,
		user: {
			id: user.id,
			name: user.name,
			email: user.email
		}
	}
}
