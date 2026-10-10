import { index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("erp_user_role", ["admin", "testing", "user"]);

export const usersTable = pgTable(
  "erp_users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("testing"),
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

export const auditLogTable = pgTable(
  "erp_audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id"),
    actorUsername: text("actor_username").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("erp_audit_log_created_at_idx").on(table.createdAt), index("erp_audit_log_actor_idx").on(table.actorId)],
);
