"use client"

import { ApiError, api } from "@/lib/api"
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
		setError("");
		setLoading(true);

		try {
			await api.post("/auth/login", { email, password });
			router.push("/dashboard")
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-linear-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
			<div className="w-full max-w-md">
				{/* Logo */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-xl font-bold shadow-lg mb-4">
						CF
					</div>
					<h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
					<p className="text-gray-500 text-sm mt-1">Sign in to your CollabFlow account</p>
				</div>

				<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
					{error && (
						<div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
							<span>⚠</span>
							{error}
						</div>
					)}

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1.5">
								Email
							</label>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
								placeholder="you@example.com"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1.5">
								Password
							</label>
							<input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
								placeholder="••••••••"
								required
							/>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
						>
							{loading ? "Signing in…" : "Sign in"}
						</button>
					</form>

					<p className="text-center text-sm text-gray-500 mt-6">
						Don&apos;t have an account?{" "}
						<Link href="/register" className="text-blue-600 font-medium hover:underline">
							Create one
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
