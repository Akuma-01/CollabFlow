"use client"

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
	const router = useRouter();

	const handleLogout = () => {
		localStorage.removeItem("token");
		localStorage.removeItem("user_id");
		router.replace('/login');
	}

	const pathname = usePathname();

	if (pathname === "/login" || pathname === "/register") {
		return null;
	}

	return (
		<nav className="w-full bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
			<div className="flex items-center gap-6">
				<Link
					href="/dashboard"
					className="text-xl font-bold text-blue-600"
				>
					CollabFlow
				</Link>
				<Link
					href="/dashboard"
					className="text-sm text-gray-600 hover:text-black"
				>
					Dashboard
				</Link>
			</div>
			<div>
				<button
					onClick={handleLogout}
					className="text-sm text-red-500 hover:text-red-600"
				>
					Logout
				</button>
			</div>
		</nav>
	)
}
