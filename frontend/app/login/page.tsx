"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false);

	const router = useRouter()

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault()

		setLoading(true);

		try {
			const response = await fetch("http://localhost:3000/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password })
			})

			const data = await response.json()
			if (!response.ok) {
				throw new Error(data.message || "Login failed");
			}

			// optional: store token
			localStorage.setItem("token", data.data.token);
			localStorage.setItem("user_id", data.data.user.id);

			router.push("/dashboard")
		} catch (err) {
			console.error(err)
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 bg-white rounded-2xl shadow-md w-full max-w-md">
				{error && <p className="text-red-500">{error}</p>}
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
					className="bg-blue-700 text-white rounded-xl p-4 w-full hover:bg-blue-800"
					disabled={loading}
				>
					{loading ? "Logging In..." : "Login"}
				</button>
				<p className="text-sm text-center">
					Don&apos;t have an account?
					<Link href="/register" className="text-blue-600 hover:underline">
						Register
					</Link>
				</p>
			</form>
		</div>
	)
}
