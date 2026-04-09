const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const userRoutes = require("./routes/user.routes");
const petRoutes = require("./routes/pet.routes");
const ehrRoutes = require("./routes/ehr.routes");
const appointmentRoutes = require('./routes/appointment.routes');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── CORS – must be before any route/proxy ────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS Error: Origin ${origin} is not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));

// Pre-flight: answer all OPTIONS requests immediately
app.options("*", cors(corsOptions));

// Logging & security (no body-parser here – proxied requests must keep their body stream intact)
app.use(helmet());
app.use(morgan("dev"));

// ─── Global request logger ────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.originalUrl}`);
  console.log('[Auth]', req.headers.authorization);
  next();
});

// ─── Routes (proxy middleware – no express.json() before these) ───────────────
// userRoutes handles /api/v1/users AND /api/v1/clinics (both → User Service)
app.use(userRoutes);
app.use(petRoutes);
app.use('/', ehrRoutes);
app.use('/', appointmentRoutes);

// ─── Non-proxied routes (body parsing is fine here) ──────────────────────────
app.use(express.json());

// Health checks (Railway often probes / natively)
app.get("/", (req, res) => res.send("PetWell API Gateway is running!"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", gateway: "PetWell API Gateway", port: PORT });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});

// Evitar que Railway o un error mate la app inmediatamente (graceful mode)
process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Global error caught:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] Unhandled Promise Rejection:', reason);
});
