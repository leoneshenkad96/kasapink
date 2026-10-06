import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { count, eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { checkRole, createToken, type AuthRequest, verifyToken } from "../lib/auth";

const router = Router();
const publicUser = (user: { id: number; username: string; role: "admin" | "testing" }) => ({
  id: user.id,
  username: user.username,
  role: user.role,
});

function constantTimeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.get("/setup/status", async (_req, res) => {
  const [result] = await db.select({ total: count() }).from(usersTable);
  res.json({ needsAdmin: Number(result.total) === 0, setupEnabled: Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN) });
});

// One-time admin bootstrap. Set a temporary ADMIN_BOOTSTRAP_TOKEN before first setup,
// then remove it from hosting environment settings after the first admin is created.
router.post("/setup/admin", async (req, res) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: "JWT_SECRET belum dikonfigurasi dengan benar." });
  }
  const setupToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const suppliedToken = typeof req.body.bootstrapToken === "string" ? req.body.bootstrapToken : "";
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!setupToken || !constantTimeEqual(suppliedToken, setupToken)) {
    return res.status(403).json({ error: "Token setup admin salah atau belum diatur." });
  }
  if (!username || username.length > 80 || password.length < 8) {
    return res.status(400).json({ error: "Username wajib diisi dan password minimal 8 karakter." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73452891)`);
    const [result] = await tx.select({ total: count() }).from(usersTable);
    if (Number(result.total) > 0) return null;
    const [created] = await tx.insert(usersTable)
      .values({ username, passwordHash, role: "admin" })
      .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role });
    return created;
  });
  if (!user) return res.status(409).json({ error: "Admin sudah dibuat. Silakan login." });

  const token = createToken(user, res);
  if (!token) return;
  return res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!username || !password) return res.status(400).json({ error: "Username dan password wajib diisi." });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Username atau password salah." });
  }
  const token = createToken(publicUser(user), res);
  if (!token) return;
  return res.json({ token, user: publicUser(user) });
});

router.get("/me", verifyToken, (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

router.post("/logout", (_req, res) => res.status(204).end());

router.get("/users", verifyToken, checkRole("admin"), async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.username);
  res.json(users);
});

router.post("/users", verifyToken, checkRole("admin"), async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = req.body.role;
  if (!username || username.length > 80 || password.length < 8 || !["admin", "testing"].includes(role)) {
    return res.status(400).json({ error: "Username wajib diisi, password minimal 8 karakter, dan role harus admin/testing." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [created] = await db.insert(usersTable).values({ username, passwordHash, role })
      .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });
    return res.status(201).json(created);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") return res.status(409).json({ error: "Username sudah digunakan." });
    throw error;
  }
});

export default router;
