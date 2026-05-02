"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
	const router = useRouter();
	const pathname = usePathname();

	const handleLogout = () => {
		localStorage.removeItem("token");
		localStorage.removeItem("user_id");
		router.replace("/login");
	};

	if (pathname === "/login" || pathname === "/register") {
		return null;
	}

	const isActive = (path: string) => pathname === path;

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-white/90 backdrop-blur">
			<nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
				{/* Left */}
				<div className="flex items-center gap-8">
					<Link href="/dashboard" className="flex items-center gap-2">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm">
							CF
						</div>

						<span className="text-lg font-semibold tracking-tight text-gray-900">
							CollabFlow
						</span>
					</Link>

					<div className="hidden items-center gap-1 md:flex">
						<Link
							href="/dashboard"
							className={
								isActive("/dashboard")
									? "rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700"
									: "rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
							}
						>
							Dashboard
						</Link>
					</div>
				</div>

				{/* Right */}
				<div className="flex items-center gap-3">
					<button
						onClick={handleLogout}
						className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
					>
						Logout
					</button>
				</div>
			</nav>
		</header>
	);
}
