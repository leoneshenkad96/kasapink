import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { count, eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { checkRole, createToken, type AuthRequest, verifyToken } from "../lib/auth";

const router = Router();
const publicUser = (user: { id: number; username: string; role: "admin" | "testing" | "user" }) => ({
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
  if (!username || !password || username.length > 80 || password.length > 128) return res.status(400).json({ error: "Username dan password wajib diisi." });

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

router.put("/users/change-password", verifyToken, async (req: AuthRequest, res) => {
  const oldPassword = typeof req.body.oldPassword === "string" ? req.body.oldPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  if (!oldPassword || oldPassword.length > 128 || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: "Password lama wajib diisi dan password baru minimal 8 karakter." });
  }

  const [user] = await db.select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable).where(eq(usersTable.id, req.authUser!.id));
  if (!user) return res.status(404).json({ error: "Akun tidak ditemukan." });
  if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Password lama salah." });
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({ error: "Password baru harus berbeda dari password lama." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, req.authUser!.id));
  return res.json({ message: "Password berhasil diganti." });
});

router.get("/users", verifyToken, checkRole("admin"), async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.username);
  res.json(users);
});

router.put("/users/:id", verifyToken, checkRole("admin"), async (req: AuthRequest, res) => {
  const userIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = Number(userIdParam);
  const role = req.body.role;
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  if (!/^\d+$/.test(userIdParam) || !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "ID user tidak valid." });
  }
  if (!["admin", "testing", "user"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid." });
  }
  if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
    return res.status(400).json({ error: "Password baru minimal 8 karakter." });
  }
  if (userId === req.authUser!.id && role !== "admin") {
    return res.status(400).json({ error: "Role akun admin yang sedang digunakan tidak dapat diturunkan." });
  }

  const values: { role: "admin" | "testing" | "user"; passwordHash?: string } = { role };
  if (newPassword) values.passwordHash = await bcrypt.hash(newPassword, 12);
  const [updatedUser] = await db.update(usersTable)
    .set(values)
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });
  if (!updatedUser) return res.status(404).json({ error: "User tidak ditemukan." });
  return res.json(updatedUser);
});

router.delete("/users/:id", verifyToken, checkRole("admin"), async (req: AuthRequest, res) => {
  const userIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = Number(userIdParam);
  if (!/^\d+$/.test(userIdParam) || !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "ID user tidak valid." });
  }
  if (userId === req.authUser!.id) {
    return res.status(400).json({ error: "Admin tidak dapat menghapus akun sendiri." });
  }

  const [deletedUser] = await db.delete(usersTable)
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });
  if (!deletedUser) return res.status(404).json({ error: "User tidak ditemukan." });
  return res.status(200).json({ id: deletedUser.id, message: "User berhasil dihapus." });
});

router.post("/users", verifyToken, checkRole("admin"), async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = req.body.role;
  if (!username || username.length > 80 || password.length < 8 || password.length > 128 || !["admin", "testing", "user"].includes(role)) {
    return res.status(400).json({ error: "Username wajib diisi, password minimal 8 karakter, dan role harus admin/testing/user." });
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
