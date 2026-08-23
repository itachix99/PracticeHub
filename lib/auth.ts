import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// In-memory login attempt tracking (per-process). For multi-instance prod use Redis.
type AttemptInfo = { count: number; lockUntil?: number; lastAt: number };
const loginAttempts = new Map<string, AttemptInfo>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 min
const WINDOW_MS = 15 * 60 * 1000;

function isLocked(email: string): boolean {
  const info = loginAttempts.get(email.toLowerCase());
  if (!info?.lockUntil) return false;
  if (Date.now() > info.lockUntil) {
    loginAttempts.delete(email.toLowerCase());
    return false;
  }
  return true;
}

function recordFailure(email: string) {
  const key = email.toLowerCase();
  const now = Date.now();
  const info = loginAttempts.get(key);
  if (!info || now - info.lastAt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAt: now });
    return;
  }
  const nextCount = info.count + 1;
  if (nextCount >= MAX_ATTEMPTS) {
    loginAttempts.set(key, { count: nextCount, lastAt: now, lockUntil: now + LOCK_MS });
  } else {
    loginAttempts.set(key, { count: nextCount, lastAt: now });
  }
}

function recordSuccess(email: string) {
  loginAttempts.delete(email.toLowerCase());
}

const BCRYPT_ROUNDS = 12;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (isLocked(email)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
          recordFailure(email);
          return null;
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          recordFailure(email);
          return null;
        }
        recordSuccess(email);
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role } as unknown as Record<string, unknown> as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role?: string; id?: string };
        (token as unknown as Record<string, unknown>).role = u.role ?? "STUDENT";
        (token as unknown as Record<string, unknown>).id = u.id;
      } else if (token.email) {
        if (!(token as unknown as Record<string, unknown>).role) {
          const dbUser = await prisma.user.findUnique({ where: { email: token.email as string }, select: { id: true, role: true } });
          if (dbUser) {
            (token as unknown as Record<string, unknown>).role = dbUser.role;
            (token as unknown as Record<string, unknown>).id = dbUser.id;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const t = token as unknown as { role?: string; id?: string; sub?: string };
        (session.user as unknown as Record<string, unknown>).role = t.role ?? "STUDENT";
        (session.user as unknown as Record<string, unknown>).id = t.id ?? t.sub ?? "";
      }
      return session;
    },
  },
  trustHost: true,
});

export { BCRYPT_ROUNDS, isLocked, loginAttempts };
