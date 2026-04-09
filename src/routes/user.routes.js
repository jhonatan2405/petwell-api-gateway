const { createProxyMiddleware } = require("http-proxy-middleware");
const express = require("express");
require("dotenv").config();

const USER_SERVICE_URL = process.env.USER_SERVICE_URL && process.env.USER_SERVICE_URL !== "undefined" 
  ? process.env.USER_SERVICE_URL 
  : "http://localhost:3003";

if (!USER_SERVICE_URL.startsWith("http")) {
  throw new Error(`CRITICAL: USER_SERVICE_URL is invalid -> "${USER_SERVICE_URL}"`);
}

const router = express.Router();

/**
 * onProxyReq: called just before the request is sent to the target.
 * Removing content-length lets http-proxy-middleware set the correct value
 * and prevents POST bodies from being silently dropped or causing hangs.
 */
function onProxyReq(proxyReq, req) {
  proxyReq.removeHeader("content-length");
}

const makeProxy = (serviceName) =>
  createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    on: {
      proxyReq: onProxyReq,
      error: (err, req, res) => {
        console.error(`[${serviceName} Proxy Error]`, err.message);
        res.status(502).json({
          success: false,
          message: `${serviceName} no disponible`,
        });
      },
    },
  });

// Proxy → /api/v1/users  → User Service
router.use("/api/v1/users", makeProxy("User Service"));

// Proxy → /api/v1/clinics → User Service
router.use("/api/v1/clinics", makeProxy("User Service (clinics)"));

module.exports = router;
