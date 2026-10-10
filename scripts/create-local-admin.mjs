import bcrypt from "bcryptjs";
import { createRequire } from "node:module";

const requireFromDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const pg = requireFromDb("pg");

const databaseUrl = process.env.DATABASE_URL;
const username = process.env.LOCAL_ADMIN_USERNAME;
const password = process.env.LOCAL_ADMIN_PASSWORD;

if (!databaseUrl || !username || !password) {
  throw new Error("Local admin setup requires DATABASE_URL and LOCAL_ADMIN_* variables.");
}

const parsedUrl = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("Refusing to create a local admin on a non-local database.");
}
if (password.length < 12) throw new Error("Local admin password must be at least 12 characters.");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const existing = await client.query(
    "SELECT id, role FROM public.erp_users WHERE username = $1",
    [username],
  );
  if (existing.rowCount === 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      "INSERT INTO public.erp_users (username, password_hash, role) VALUES ($1, $2, 'admin')",
      [username, passwordHash],
    );
    console.log("Local admin created.");
  } else if (existing.rows[0].role !== "admin") {
    throw new Error("The configured local username exists but is not an admin.");
  } else {
    console.log("Local admin already exists.");
  }
} finally {
  await client.end();
}
