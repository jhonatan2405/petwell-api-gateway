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
const PORT = process.env.PORT || 3001;

// ─── CORS – must be before any route/proxy ────────────────────────────────────
app.use(
  cors({
    origin: "*", // tighten in production
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Pre-flight: answer all OPTIONS requests immediately
app.options("*", cors());

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

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", gateway: "PetWell API Gateway", port: PORT });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`   → User Service: ${process.env.USER_SERVICE_URL}`);
  console.log(`   → Pet Service:  ${process.env.PET_SERVICE_URL}`);
  console.log(`   → EHR Service:         ${process.env.EHR_SERVICE_URL || 'http://localhost:3004'}`);
  console.log(`   → Appointment Service: ${process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3005'}`);
});
