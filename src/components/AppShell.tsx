import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

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
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/requests", label: "Access Requests" },
  { href: "/admin/users", label: "Users" },
];

export default function AppShell({ role, children }: AppShellProps) {
  const isAdmin = role === "ADMIN";
  const links = isAdmin ? adminLinks : learnerLinks;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-white px-1.5 py-1 ring-1 ring-gray-200 sm:px-2">
              <Image
                src="/images/logo/aim-logo.png"
                alt="AIM Technologies"
                width={140}
                height={42}
                priority
                className="h-7 w-auto sm:h-9"
              />
            </div>
            <span className="hidden text-sm font-medium text-gray-600 sm:inline sm:text-base">
              AIM LMS
            </span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1">
            {links.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-600 sm:px-3 sm:py-2 sm:text-sm"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="shrink-0">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-3 sm:p-6">{children}</main>
    </div>
  );
}
