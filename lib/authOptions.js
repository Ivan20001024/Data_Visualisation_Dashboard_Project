import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.password_hash);
        if (!ok) return null;
        return { id: user.username_id, name: user.username };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.username = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.uid, username: token.username };
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
