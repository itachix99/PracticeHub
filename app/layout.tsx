import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "PracticeHub — Exam Simulator",
    template: "%s | PracticeHub",
  },
  description:
    "Convert previous-year papers into realistic CBT mock exams. Generic Exam Engine for SSC, IBPS, GATE and more.",
  metadataBase: new URL("http://localhost:3000"),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user as unknown as
    { email?: string; role?: string } | undefined;

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background min-h-screen font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full border-b backdrop-blur">
            <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md text-sm font-bold">
                  P
                </span>
                PracticeHub
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                <Link
                  href="/exams"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Exams
                </Link>
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dashboard
                    </Link>
                    <span className="text-muted-foreground hidden sm:inline">
                      {user.email} \u2022 {user.role || "STUDENT"}
                    </span>
                    <SignOutButton />
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/register"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium shadow"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="text-muted-foreground border-t py-6 text-center text-sm">
            <div className="container mx-auto max-w-7xl px-4">
              PracticeHub \u2014 Phase 2 Auth \u2022 Role-based access control
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}