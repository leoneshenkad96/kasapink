import bcrypt from "bcryptjs";
import { db } from "@workspace/db"; // use workspace alias
import { usersTable } from "@workspace/db/src/schema/users.ts";
import { eq } from "drizzle-orm";

async function createAdmin() {
  const username = "admin";
  const plainPassword = "@doraemon328";
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // Check if admin already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    console.log("Admin user already exists.");
    return;
  }

  await db.insert(usersTable).values({
    username,
    passwordHash,
    roles: ["admin"],
    permissions: ["*"], // super admin permissions
  });
  console.log("Admin user created.");
}

createAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
