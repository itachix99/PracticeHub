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
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;
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
