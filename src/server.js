require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── URLs de microservicios (con fallback a localhost para desarrollo local) ──
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

console.log("[Gateway] Microservice targets:");
console.log("  User Service       :", USER_SERVICE_URL);
console.log("  Pet Service        :", PET_SERVICE_URL);
console.log("  EHR Service        :", EHR_SERVICE_URL);
console.log("  Appointment Service:", APPOINTMENT_SERVICE_URL);

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
app.options("*", cors(corsOptions)); // preflight

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

// ─── Factory de proxy con pathFilter explícito ───────────────────────────────
// Usando pathFilter dentro de las opciones en lugar de app.use('/path', proxy)
// Esto hace que:
//   1. HPM muestre la ruta correcta en los logs: [HPM] Proxy created: /api/v1/auth -> ...
//   2. El path completo llegue intacto al microservicio de destino
function makeProxy(pathFilter, target, label) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter,           // ← HPM filtra por esta ruta, no Express
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.removeHeader("content-length");
      },
      error: (err, _req, res) => {
        console.error(`[${label} Proxy Error]`, err.message);
        res.status(502).json({ success: false, message: `${label} no disponible` });
      },
    },
  });
}

// ─── Proxies — montados en app.use(proxy) SIN path prefix en Express ─────────
// User Service
app.use(makeProxy("/api/v1/auth/**",    USER_SERVICE_URL, "Auth"));
app.use(makeProxy("/api/v1/users/**",   USER_SERVICE_URL, "User Service"));
app.use(makeProxy("/api/v1/clinics/**", USER_SERVICE_URL, "Clinics"));

// Pet Service
app.use(makeProxy("/api/v1/pets/**",    PET_SERVICE_URL, "Pet Service"));

// EHR Service
app.use(makeProxy("/api/v1/ehr/**",     EHR_SERVICE_URL, "EHR Service"));

// Appointment Service
app.use(makeProxy("/api/v1/appointments/**", APPOINTMENT_SERVICE_URL, "Appointment Service"));
app.use(makeProxy("/api/v1/schedules/**",    APPOINTMENT_SERVICE_URL, "Schedules"));
app.use(makeProxy("/api/v1/vetblocks/**",    APPOINTMENT_SERVICE_URL, "Vetblocks"));
app.use(makeProxy("/api/v1/waitlist/**",     APPOINTMENT_SERVICE_URL, "Waitlist"));

// ─── 404 para rutas no registradas ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ─── Servidor ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});

// Igualar keep-alive al timeout de Railway para evitar 502 intermitentes
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout   = 125 * 1000;

// ─── Señales del sistema ──────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.info("SIGTERM received — shutting down gracefully.");
  process.exit(0);
});
process.on("uncaughtException",  (err)    => console.error("[uncaughtException]",  err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
