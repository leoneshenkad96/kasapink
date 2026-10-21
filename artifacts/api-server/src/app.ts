import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { sharedAuthRateLimit } from "./middlewares/shared-auth-rate-limit";

const app: Express = express();
const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = [
  "https://erp.kasapink.com",
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://localhost:3000"]),
  ...configuredOrigins,
].filter((origin, index, origins) => origins.indexOf(origin) === index);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  } : false,
  strictTransportSecurity: process.env.NODE_ENV === "production"
    ? { maxAge: 31536000, includeSubDomains: false, preload: false }
    : false,
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  credentials: true,
}));

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Terlalu banyak request. Silakan coba lagi nanti." },
});


app.use("/api", apiLimiter);
app.use("/api/login", sharedAuthRateLimit);
app.use("/api/setup/admin", sharedAuthRateLimit);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cookieParser());
// Reject browser-origin cross-site mutations. Bearer clients without an Origin
// remain supported; cookie sessions need an Origin/Referer or same-origin Fetch Metadata.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const host = req.get("host");
  const isSameOrigin = (raw: string): boolean => {
    try {
      const url = new URL(raw);
      const local = host?.startsWith("localhost:") || host?.startsWith("127.0.0.1:");
      return url.host === host && (url.protocol === "https:" || (local && url.protocol === "http:"));
    } catch { return false; }
  };
  const origin = req.get("origin");
  const referer = req.get("referer");
  if ((origin && !isSameOrigin(origin)) || (referer && !isSameOrigin(referer))) {
    return res.status(403).json({ error: "Permintaan lintas origin ditolak." });
  }
  const hasCookieSession = typeof req.cookies?.kasapink_session === "string";
  const bearer = /^Bearer\\s+\\S+$/i.test(req.get("authorization") ?? "");
  if (hasCookieSession && !bearer && !origin && !referer &&
      req.get("sec-fetch-site") !== "same-origin") {
    return res.status(403).json({ error: "Asal permintaan tidak dapat diverifikasi." });
  }
  next();
});
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", router);

export default app;
