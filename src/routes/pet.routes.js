const { createProxyMiddleware } = require("http-proxy-middleware");
const express = require("express");
require("dotenv").config();

const PET_SERVICE_URL = process.env.PET_SERVICE_URL || "http://localhost:3002";

const router = express.Router();

function onProxyReq(proxyReq) {
  proxyReq.removeHeader("content-length");
}

const petProxy = createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: onProxyReq,
    error: (err, req, res) => {
      console.error("[Pet Proxy Error]", err.message);
      res.status(502).json({
        success: false,
        message: "Pet Service no disponible",
      });
    },
  },
});

// Proxy → /api/v1/pets → Pet Service
router.use("/api/v1/pets", petProxy);

module.exports = router;
