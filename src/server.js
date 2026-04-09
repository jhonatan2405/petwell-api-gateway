require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── Validación y lectura de URLs de microservicios ───────────────────────────
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL &&
  process.env.USER_SERVICE_URL !== "undefined" &&
  process.env.USER_SERVICE_URL.startsWith("http")
    ? process.env.USER_SERVICE_URL
    : "http://localhost:3003";

const PET_SERVICE_URL =
  process.env.PET_SERVICE_URL &&
  process.env.PET_SERVICE_URL !== "undefined" &&
  process.env.PET_SERVICE_URL.startsWith("http")
    ? process.env.PET_SERVICE_URL
    : "http://localhost:3002";

const EHR_SERVICE_URL =
  process.env.EHR_SERVICE_URL &&
  process.env.EHR_SERVICE_URL !== "undefined" &&
  process.env.EHR_SERVICE_URL.startsWith("http")
    ? process.env.EHR_SERVICE_URL
    : "http://localhost:3004";

const APPOINTMENT_SERVICE_URL =
  process.env.APPOINTMENT_SERVICE_URL &&
  process.env.APPOINTMENT_SERVICE_URL !== "undefined" &&
  process.env.APPOINTMENT_SERVICE_URL.startsWith("http")
    ? process.env.APPOINTMENT_SERVICE_URL
    : "http://localhost:3005";

console.log("[Gateway] Service URLs at startup:");
console.log("  User Service       :", USER_SERVICE_URL);
console.log("  Pet Service        :", PET_SERVICE_URL);
console.log("  EHR Service        :", EHR_SERVICE_URL);
console.log("  Appointment Service:", APPOINTMENT_SERVICE_URL);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

if (allowedOrigins.length === 0) {
  console.warn("⚠️  ALLOWED_ORIGINS not set — ALL browser requests will be blocked by CORS.");
} else {
  console.log("✅ CORS allowed origins:", allowedOrigins);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (Postman, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// CORS y preflight — ANTES de todo
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ─── Middlewares generales ────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));

// Logger global
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Health checks — ANTES de los proxies ────────────────────────────────────
app.get("/", (req, res) => res.send("PetWell API Gateway is running!"));
app.get("/health", (req, res) =>
  res.json({ status: "ok", gateway: "PetWell API Gateway", port: PORT })
);

// ─── Helper: crea proxy con manejo de errores integrado ──────────────────────
function makeProxy(target, label) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        // Eliminar content-length para que http-proxy-middleware lo recalcule
        // y evitar que POST bodies se pierdan o causen timeouts
        proxyReq.removeHeader("content-length");
      },
      error: (err, req, res) => {
        console.error(`[${label} Proxy Error]`, err.message);
        res.status(502).json({
          success: false,
          message: `${label} no disponible`,
        });
      },
    },
  });
}

// ─── Proxies con rutas base explícitas (sin usar "/" como base) ───────────────
// User Service
app.use("/api/v1/auth",    makeProxy(USER_SERVICE_URL, "Auth"));
app.use("/api/v1/users",   makeProxy(USER_SERVICE_URL, "User Service"));
app.use("/api/v1/clinics", makeProxy(USER_SERVICE_URL, "User Service (clinics)"));

// Pet Service
app.use("/api/v1/pets", makeProxy(PET_SERVICE_URL, "Pet Service"));

// EHR Service
app.use("/api/v1/ehr", makeProxy(EHR_SERVICE_URL, "EHR Service"));

// Appointment Service
app.use("/api/v1/appointments", makeProxy(APPOINTMENT_SERVICE_URL, "Appointment Service"));
app.use("/api/v1/schedules",    makeProxy(APPOINTMENT_SERVICE_URL, "Appointment Service (schedules)"));
app.use("/api/v1/vetblocks",    makeProxy(APPOINTMENT_SERVICE_URL, "Appointment Service (vetblocks)"));
app.use("/api/v1/waitlist",     makeProxy(APPOINTMENT_SERVICE_URL, "Appointment Service (waitlist)"));

// ─── 404 para rutas no registradas ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});

// Igualar keep-alive al timeout de Railway (~100s) para evitar 502 intermitentes
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;

// ─── Manejo de señales del sistema ───────────────────────────────────────────
process.on("SIGTERM", () => {
  console.info("SIGTERM received — shutting down gracefully.");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
