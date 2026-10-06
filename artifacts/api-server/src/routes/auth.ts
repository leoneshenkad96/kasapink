import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db"; // import db via workspace package
import { usersTable } from "@workspace/db/schema"; // import usersTable via workspace export
import { eq } from "drizzle-orm";

const router = Router();

// Simple login – expects JSON { username, password }
router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const rows = await db.select().from(usersTable).where(eq(usersTable.username, username));
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  // store minimal user info in session
  (req.session as any).userId = user.id;
  (req.session as any).username = user.username;
  return res.json({ message: "Logged in" });
});

// Logout – destroys session
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err: any) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    // clear cookie
    res.clearCookie("connect.sid");
    return res.json({ message: "Logged out" });
  });
});

// ──────────────────────────────────────────────────────────
// Admin – user management endpoints
// ──────────────────────────────────────────────────────────

// GET /api/admin/users – list all users (passwords excluded)
router.get("/admin/users", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      roles: usersTable.roles,
      permissions: usersTable.permissions,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    }).from(usersTable);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Gagal memuat daftar pengguna" });
  }
});

// POST /api/admin/users – create a new user
router.post("/admin/users", async (req: Request, res: Response) => {
  const { username, password, roles, permissions } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }
  try {
    // Check for duplicate username
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      return res.status(409).json({ error: `Username "${username}" sudah digunakan` });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      username,
      passwordHash,
      roles: roles || [],
      permissions: permissions || [],
    }).returning({
      id: usersTable.id,
      username: usersTable.username,
      roles: usersTable.roles,
      permissions: usersTable.permissions,
      createdAt: usersTable.createdAt,
    });
    return res.status(201).json(user);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Gagal membuat akun" });
  }
});

// PATCH /api/admin/users/:id – update user (roles, permissions, password)
router.patch("/admin/users/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID tidak valid" });
  }
  const { username, password, roles, permissions } = req.body;
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    }

    const updates: Record<string, any> = {};
    if (username !== undefined) updates.username = username;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);
    if (roles !== undefined) updates.roles = roles;
    if (permissions !== undefined) updates.permissions = permissions;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Tidak ada data yang diubah" });
    }

    const [updated] = await db.update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        roles: usersTable.roles,
        permissions: usersTable.permissions,
        updatedAt: usersTable.updatedAt,
      });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Gagal memperbarui akun" });
  }
});

// DELETE /api/admin/users/:id – delete a user
router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID tidak valid" });
  }
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    return res.json({ message: "Akun berhasil dihapus" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Gagal menghapus akun" });
  }
});

export default router;
