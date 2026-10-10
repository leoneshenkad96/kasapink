import { Router, type IRouter } from "express";
import { HealthCheckResponse, LegacyHealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", (_req, res) => {
  const data = LegacyHealthCheckResponse.parse({
    status: "OK",
    timestamp: new Date(),
  });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "ready" });
  } catch (error) {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

export default router;
