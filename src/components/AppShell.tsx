"use client";

import LiveUsersChip from "@/components/LiveUsersChip";
import NavigationProgress from "@/components/NavigationProgress";
import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type AppShellProps = {
  role: string;
  children: React.ReactNode;
};

const learnerLinks = [
  { href: "/", label: "Courses" },
  { href: "/my-learning", label: "My Learning" },
];

const adminLinks = [
  { href: "/", label: "Courses" },
  { href: "/my-learning", label: "My Learning" },
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/notes", label: "Content Agent" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/requests", label: "Access Requests" },
  { href: "/admin/users", label: "Users" },
];

export default function AppShell({ role, children }: AppShellProps) {
  const isAdmin = role === "ADMIN";
  const links = isAdmin ? adminLinks : learnerLinks;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const searchTarget = useMemo(() => {
    if (pathname.startsWith("/courses/")) return pathname.split("/watch/")[0];
    return "/";
  }, [pathname]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    const url = q
      ? `${searchTarget}?q=${encodeURIComponent(q)}`
      : searchTarget;
    router.push(url);
  }

  return (
    <div className="min-h-screen bg-[var(--yt-bg)] text-[var(--yt-ink)]">
      <NavigationProgress />
      <header className="sticky top-0 z-40 bg-[var(--yt-surface)]">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-3 py-2 sm:gap-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image
              src="/images/logo/aim-logo.png"
              alt="AIM Technologies"
              width={120}
              height={36}
              priority
              className="h-7 w-auto sm:h-8"
            />
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">
              LMS
            </span>
          </Link>

          <form
            onSubmit={onSearch}
            className="mx-auto hidden min-w-0 max-w-[640px] flex-1 items-stretch sm:flex"
          >
            <input
              className="yt-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search"
            />
            <button type="submit" className="yt-search-btn" aria-label="Submit search">
              ⌕
            </button>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <LiveUsersChip isAdmin={isAdmin} />
            <UserButton />
          </div>
        </div>

        <form onSubmit={onSearch} className="flex px-3 pb-2 sm:hidden">
          <input
            className="yt-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search"
          />
          <button type="submit" className="yt-search-btn" aria-label="Submit search">
            ⌕
          </button>
        </form>

        <nav className="border-t border-[var(--yt-border)]">
          <div className="mx-auto flex max-w-[1800px] gap-2 overflow-x-auto px-3 py-2 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className={`yt-chip ${active ? "yt-chip-active" : ""}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1800px] px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
