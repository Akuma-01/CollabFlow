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
		<div className="min-h-screen bg-gray-200 flex items-center justify-center">
			<div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">

				<h1 className="text-2xl font-bold text-center mb-6 text-blue-600">
					CollabFlow
				</h1>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">

					{error && <p className="text-red-500 text-sm">{error}</p>}

					<input
						type="email"
						className="border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
						value={email}
						onChange={e => setEmail(e.target.value)}
						placeholder="Email"
						required
					/>

					<input
						type="password"
						className="border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
						value={password}
						onChange={e => setPassword(e.target.value)}
						placeholder="Password"
						required
					/>

					<button
						type="submit"
						disabled={loading}
						className="bg-blue-600 text-white rounded-lg p-3 hover:bg-blue-700 disabled:opacity-50"
					>
						{loading ? "Logging In..." : "Login"}
					</button>

					<p className="text-sm text-center">
						Don&apos;t have an account?{" "}
						<Link href="/register" className="text-blue-600 hover:underline">
							Register
						</Link>
					</p>

				</form>
			</div>
		</div>
	)
}
