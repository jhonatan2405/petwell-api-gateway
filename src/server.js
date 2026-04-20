require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── URLs de microservicios ───────────────────────────────────────────────────
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL?.startsWith("http")
    ? process.env.USER_SERVICE_URL
    : "http://localhost:3003";

const PET_SERVICE_URL =
  process.env.PET_SERVICE_URL?.startsWith("http")
    ? process.env.PET_SERVICE_URL
    : "http://localhost:3002";

const EHR_SERVICE_URL =
  process.env.EHR_SERVICE_URL?.startsWith("http")
    ? process.env.EHR_SERVICE_URL
    : "http://localhost:3004";

const APPOINTMENT_SERVICE_URL =
  process.env.APPOINTMENT_SERVICE_URL?.startsWith("http")
    ? process.env.APPOINTMENT_SERVICE_URL
    : "http://localhost:3005";

const TELEMED_SERVICE_URL =
  process.env.TELEMED_SERVICE_URL?.startsWith("http")
    ? process.env.TELEMED_SERVICE_URL
    : "http://localhost:3006";

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL?.startsWith("http")
    ? process.env.NOTIFICATION_SERVICE_URL
    : "http://localhost:3007";

const BILLING_SERVICE_URL =
  process.env.BILLING_SERVICE_URL?.startsWith("http")
    ? process.env.BILLING_SERVICE_URL
    : "http://localhost:3009";

const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL?.startsWith("http")
    ? process.env.ANALYTICS_SERVICE_URL
    : "http://localhost:3008";

console.log("[Gateway] Microservice targets:");
console.log("  User Service       :", USER_SERVICE_URL);
console.log("  Pet Service        :", PET_SERVICE_URL);
console.log("  EHR Service        :", EHR_SERVICE_URL);
console.log("  Appointment Service:", APPOINTMENT_SERVICE_URL);
console.log("  Telemed Service    :", TELEMED_SERVICE_URL);
console.log("  Notification Service:", NOTIFICATION_SERVICE_URL);
console.log("  Billing Service    :", BILLING_SERVICE_URL);
console.log("  Analytics Service  :", ANALYTICS_SERVICE_URL);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

if (allowedOrigins.length === 0) {
  console.warn("⚠️  ALLOWED_ORIGINS not set — all browser requests will be blocked by CORS.");
} else {
  console.log("✅ CORS allowed origins:", allowedOrigins);
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman / curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ─── Middlewares generales ────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));
app.use((req, _res, next) => {
  console.log(`[Gateway] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Health checks — ANTES de los proxies ────────────────────────────────────
app.get("/", (_req, res) => res.send("PetWell API Gateway is running!"));
app.get("/health", (_req, res) =>
  res.json({ status: "ok", gateway: "PetWell API Gateway", port: PORT })
);

// ─── Helper: opciones comunes del proxy ──────────────────────────────────────
function proxyOptions(target, label) {
  return {
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.removeHeader("content-length");
      },
      error: (err, _req, res) => {
        console.error(`[${label} Proxy Error]`, err.message);
        res.status(502).json({ success: false, message: `${label} no disponible` });
      },
    },
  };
}

// ─── Proxies — un proxy por ruta, path base explícito en app.use ──────────────
// NOTA: HTTP Proxy Middleware reporta "[HPM] Proxy created: / -> ..."
// cuando se usa app.use('/path', proxy). Eso es comportamiento normal de HPM:
// Express recorta el prefix y HPM se ve a sí mismo montado en "/".
// El routing ES correcto — solo el mensaje de log es relativo.

// User Service
app.use("/api/v1/auth",    createProxyMiddleware(proxyOptions(USER_SERVICE_URL, "Auth")));
app.use("/api/v1/users",   createProxyMiddleware(proxyOptions(USER_SERVICE_URL, "User Service")));
app.use("/api/v1/clinics", createProxyMiddleware(proxyOptions(USER_SERVICE_URL, "Clinics")));

// Pet Service
app.use("/api/v1/pets",    createProxyMiddleware(proxyOptions(PET_SERVICE_URL, "Pet Service")));

// EHR Service
app.use("/api/v1/ehr",     createProxyMiddleware(proxyOptions(EHR_SERVICE_URL, "EHR Service")));

// Appointment Service
app.use("/api/v1/appointments", createProxyMiddleware(proxyOptions(APPOINTMENT_SERVICE_URL, "Appointment Service")));
app.use("/api/v1/schedules",    createProxyMiddleware(proxyOptions(APPOINTMENT_SERVICE_URL, "Schedules")));
app.use("/api/v1/vetblocks",    createProxyMiddleware(proxyOptions(APPOINTMENT_SERVICE_URL, "Vetblocks")));
app.use("/api/v1/waitlist",     createProxyMiddleware(proxyOptions(APPOINTMENT_SERVICE_URL, "Waitlist")));

// Telemed Service
app.use("/api/v1/telemed",      createProxyMiddleware(proxyOptions(TELEMED_SERVICE_URL, "Telemed Service")));

// Notification Service
app.use(
  "/api/v1/notifications",
  createProxyMiddleware(proxyOptions(NOTIFICATION_SERVICE_URL, "Notification Service"))
);

// Billing Service
app.use(
  "/api/v1/billing",
  createProxyMiddleware(proxyOptions(BILLING_SERVICE_URL, "Billing Service"))
);

// Analytics Service
app.use(
  "/api/v1/analytics",
  createProxyMiddleware(proxyOptions(ANALYTICS_SERVICE_URL, "Analytics Service"))
);

// ─── 404 para rutas no registradas ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ─── Servidor ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout   = 125 * 1000;

// ─── Señales del sistema ──────────────────────────────────────────────────────
process.on("SIGTERM",           () => { console.info("SIGTERM received."); process.exit(0); });
process.on("uncaughtException",  (err)    => console.error("[uncaughtException]",  err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
