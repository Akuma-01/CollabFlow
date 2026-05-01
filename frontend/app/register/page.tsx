"use client"

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const router = useRouter();

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		if (!username || !email || !password) {
			setError("All fields are required");
			return;
		}

		setLoading(true);

		try {
			const response = await fetch("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: username, email, password })
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || "Registeration failed");
			}

			// after successful register
			const loginResponse = await fetch("http://localhost:3000/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password })
			})

			if (!loginResponse.ok) {
				throw new Error("Login failed after registration");
			}

			const loginData = await loginResponse.json()
			localStorage.setItem("token", loginData.data.token)
			localStorage.setItem("user_id", loginData.data.user.id);

			router.push("/dashboard")

		} catch (err) {
			console.log(err);
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex justify-center items-center min-h-screen">
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8">

				{error && <p className="text-red-500">{error}</p>}

				<input
					type="text"
					className="border-2 rounded-xl p-4 bg-white border-blue-700"
					value={username}
					onChange={e => setUsername(e.target.value)}
					placeholder="Username"
				/>
				<input
					type="email"
					className="border-2 rounded-xl p-4 bg-white border-blue-700"
					value={email}
					onChange={e => setEmail(e.target.value)}
					placeholder="Email"
				/>
				<input
					type="password"
					className="border-2 rounded-xl p-4 bg-white border-blue-700"
					value={password}
					onChange={e => setPassword(e.target.value)}
					placeholder="Password"
				/>
				<button
					type="submit"
					disabled={loading}
					className="bg-blue-700 text-white rounded-xl p-4 hover:bg-blue-800"
				>
					{loading ? "Registering..." : "Register"}
				</button>
				<p className="text-sm text-center">
					Already have an account?
					<Link
						href="/login"
						className="text-blue-600 hover:underline"
					>
						Login
					</Link>
				</p>
			</form>

		</div>
	)
}
