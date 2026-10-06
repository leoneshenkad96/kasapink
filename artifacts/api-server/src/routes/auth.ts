import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "../lib/db"; // adjust import as needed
import { usersTable } from "@workspace/db/src/schema/users"; // might need alias resolution
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

export default router;
