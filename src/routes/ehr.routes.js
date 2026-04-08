const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();

const ehrProxy = createProxyMiddleware({
  target: process.env.EHR_SERVICE_URL || 'http://localhost:3004',
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
