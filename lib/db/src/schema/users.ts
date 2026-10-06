import { pgTable, serial, text, timestamp, json, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "erp_users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    // store roles and permissions as JSON arrays
    roles: json("roles").$type<string[]>().default([]),
    permissions: json("permissions").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("erp_users_username_unique").on(table.username)]
);
