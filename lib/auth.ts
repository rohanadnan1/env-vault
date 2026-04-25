import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

const SESSION_VERSION_CHECK_INTERVAL_MS = 60_000;

type SessionVersionLookupResult =
  | { status: "ok"; sessionVersion: number | null }
  | { status: "unavailable" };

async function lookupSessionVersion(userId: string): Promise<SessionVersionLookupResult> {
  try {
    const dbUser = await db.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });

    return {
      status: "ok",
      sessionVersion: dbUser?.sessionVersion ?? null,
    };
  } catch (error) {
    // Keep existing sessions alive during transient DB/network outages.
    // We catch broadly because Prisma can throw PrismaClientKnownRequestError,
    // PrismaClientInitializationError, or raw connection errors depending on
    // the pool state — all of which should be treated as a temporary outage.
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[AUTH] Skipping sessionVersion check due to DB error: ${msg}`);
    return { status: "unavailable" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      try {
        if (user) {
          // Initial sign-in: embed sessionVersion when available.
          const userId = user.id as string;
          const result = await lookupSessionVersion(userId);

          token.id = userId;
          token.sessionVersion =
            result.status === "ok" && result.sessionVersion !== null
              ? result.sessionVersion
              : (token.sessionVersion as number | undefined) ?? 1;
          token.sessionVersionCheckedAt = Date.now();
        } else if (trigger === 'update') {
          // Forced refresh (keep current device after sign-out-all)
          if (token.id) {
            const result = await lookupSessionVersion(token.id as string);

            if (result.status === "ok") {
              if (result.sessionVersion === null) return null;
              token.sessionVersion = result.sessionVersion;
            }

            token.sessionVersionCheckedAt = Date.now();
          }
        } else if (token.id) {
          const now = Date.now();
          const lastChecked = Number(token.sessionVersionCheckedAt ?? 0);

          // Throttle DB checks to avoid request amplification.
          if (now - lastChecked >= SESSION_VERSION_CHECK_INTERVAL_MS) {
            // Normal request: validate sessionVersion to detect sign-out-all.
            const result = await lookupSessionVersion(token.id as string);

            if (result.status === "ok") {
              const tokenVersion =
                typeof token.sessionVersion === "number"
                  ? token.sessionVersion
                  : (result.sessionVersion ?? 1);

              token.sessionVersion = tokenVersion;
              token.sessionVersionCheckedAt = now;

              if (result.sessionVersion === null || result.sessionVersion !== tokenVersion) {
                return null; // invalidate — user was signed out from all devices
              }
            } else {
              // DB unavailable: keep existing token and retry later.
              token.sessionVersionCheckedAt = now;
            }
          }
        }
        return token;
      } catch (err) {
        // Last-resort guard: if an error escapes lookupSessionVersion (e.g. a
        // Prisma connection-pool rejection that bypasses the inner try-catch),
        // keep the existing session alive rather than invalidating it.
        // This prevents a DB outage from signing every user out simultaneously.
        console.warn(
          '[AUTH] Unexpected JWT callback error — preserving session:',
          err instanceof Error ? err.message : String(err)
        );
        return token;
      }
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  providers: [
    Resend({
      from: process.env.RESEND_FROM,
      apiKey: process.env.RESEND_API_KEY,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const user = await db.user.findUnique({
          where: { email: credentials.email as string }
        });
        
        if (!user || !user.password) return null;

        const isMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      }
    })
  ]
});
