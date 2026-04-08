const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();

const appointmentProxy = createProxyMiddleware({
  target: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3005',
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      console.log(`[Gateway] → APPOINTMENT ${req.method} ${req.originalUrl}`);
      proxyReq.removeHeader('content-length');
      if (req.headers['authorization']) {
        proxyReq.setHeader('Authorization', req.headers['authorization']);
        console.log('🔑 TOKEN FORWARDED:', req.headers['authorization']);
      }
    },
    error: (err, req, res) => {
      console.error('[Gateway ERROR] APPOINTMENT', err.message);
      res.status(502).json({
        success: false,
        message: 'Appointment Service no disponible',
      });
    },
  },
});

// Single prefix entry correctly forwards all subroutes (/api/v1/appointments AND /api/v1/appointments/:id)
// DO NOT add a separate router.use('/api/v1/appointments/:id', ...) — Express router.use() strips the full
// matched path, which would send "/" instead of "/SOME-ID" to the appointment service.
router.use('/api/v1/appointments', appointmentProxy);
router.use('/api/v1/schedules', appointmentProxy);
router.use('/api/v1/vetblocks', appointmentProxy);
router.use('/api/v1/waitlist', appointmentProxy);

module.exports = router;
