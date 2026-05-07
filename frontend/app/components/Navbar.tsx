"use client";

import { api } from "@/lib/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
	const router = useRouter();
	const pathname = usePathname();

	if (pathname === "/login" || pathname === "/register") return null;

	const handleLogout = async () => {
		await api.post("/auth/logout").catch(() => { });
		router.replace("/login");
	};

	const isActive = (path: string) => pathname === path;

	return (
		<header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
			<nav className="mx-auto flex max-w-7xl items-center justify-between px-6 h-14">
				{/* Left */}
				<div className="flex items-center gap-6">
					<Link href="/dashboard" className="flex items-center gap-2.5">
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm">
							CF
						</div>
						<span className="text-sm font-semibold tracking-tight text-gray-900">
							CollabFlow
						</span>
					</Link>

					<div className="hidden items-center gap-1 md:flex">
						<Link
							href="/dashboard"
							className={
								isActive("/dashboard")
									? "rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
									: "rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
							}
						>
							Dashboard
						</Link>
					</div>
				</div>

				{/* Right */}
				<button
					onClick={handleLogout}
					className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
				>
					Sign out
				</button>
			</nav>
		</header>
	);
}
