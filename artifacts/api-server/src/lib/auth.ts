import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export type UserRole = "admin" | "testing" | "user";
export type AuthUser = { id: number; username: string; role: UserRole };
export type AuthRequest = Request & { authUser?: AuthUser; authUpdatedAt?: Date };
export type SessionUser = AuthUser & { passwordHash: string; updatedAt: Date };
type JwtPayload = AuthUser & { iat: number; exp: number; revision: string };
const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function getSecret(res?: Response): string | null {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (res) res.status(503).json({ error: "JWT_SECRET belum dikonfigurasi dengan benar." });
  return null;
}

// Bind each token to the current credentials and account revision without
// putting the password hash in a readable JWT payload.
function sessionRevision(user: SessionUser, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify([user.id, user.passwordHash, user.updatedAt.toISOString()]))
    .digest("base64url");
}

export function createToken(user: SessionUser, res?: Response): string | null {
  const secret = getSecret(res);
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    id: user.id, username: user.username, role: user.role,
    revision: sessionRevision(user, secret), iat: now, exp: now + 60 * 60,
  }));
  const content = `${header}.${payload}`;
  const token = `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
  res?.cookie("kasapink_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 1000,
    path: "/",
  });
  return token;
}

function verifyTokenValue(token: string): JwtPayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const jwtHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
    if (
      jwtHeader.alg !== "HS256" ||
      !Number.isSafeInteger(data.id) ||
      data.id <= 0 ||
      typeof data.username !== "string" || !data.username ||
      !["admin", "testing", "user"].includes(data.role) ||
      !Number.isInteger(data.iat) ||
      data.iat > Math.floor(Date.now() / 1000) ||
      !Number.isInteger(data.exp) ||
      data.exp <= data.iat ||
      typeof data.revision !== "string" ||
      data.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return data;
  } catch { return null; }
}

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!getSecret(res)) return;
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : typeof req.cookies?.kasapink_session === "string" ? req.cookies.kasapink_session : "";
  const user = token ? verifyTokenValue(token) : null;
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid atau sudah berakhir. Silakan login kembali." });
    return;
  }

  const [currentUser] = await db
    .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role,
      passwordHash: usersTable.passwordHash, updatedAt: usersTable.updatedAt })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  if (!currentUser || currentUser.username !== user.username || currentUser.role !== user.role ||
      sessionRevision(currentUser, getSecret()!) !== user.revision) {
    res.status(401).json({ error: "Sesi tidak lagi berlaku. Silakan login kembali." });
    return;
  }

  req.authUser = { id: currentUser.id, username: currentUser.username, role: currentUser.role };
  req.authUpdatedAt = currentUser.updatedAt;
  next();
}

export function checkRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Akses ditolak." });
      return;
    }
    next();
  };
}

export function requireOperationalRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Akun ini hanya dapat melihat data." });
      return;
    }
    next();
  };
}
