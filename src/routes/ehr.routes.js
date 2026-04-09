const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();

const EHR_SERVICE_URL = process.env.EHR_SERVICE_URL && process.env.EHR_SERVICE_URL !== "undefined"
  ? process.env.EHR_SERVICE_URL 
  : "http://localhost:3004";

if (!EHR_SERVICE_URL.startsWith("http")) {
  throw new Error(`CRITICAL: EHR_SERVICE_URL is invalid -> "${EHR_SERVICE_URL}"`);
}

const ehrProxy = createProxyMiddleware({
  target: EHR_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/ehr': '/api/v1/ehr',
  },
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.removeHeader('content-length');
    },
    error: (err, req, res) => {
      console.error('[Gateway ERROR] EHR', err.message);
      res.status(502).json({
        success: false,
        message: 'EHR Service no disponible',
      });
    },
  },
});

router.use('/api/v1/ehr', ehrProxy);

module.exports = router;
