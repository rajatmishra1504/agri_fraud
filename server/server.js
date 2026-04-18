const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const pool = require('./database/db');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const { getApiDocsHtml } = require('./utils/apiDocs');

const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

// 1. Core Security & Middleware
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // Allow external fonts and scripts for documentation
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again shortly.' }
});
if (!isDevelopment) {
  app.use('/api/', limiter);
}

// 3. Static Assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 4. PUBLIC DOCUMENTATION & STATUS (Must be before catch-all)
app.get('/api', (req, res) => res.redirect('/api-docs'));

app.get('/api-docs', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}/api`;
  res.send(getApiDocsHtml(baseUrl));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0', timestamp: new Date().toISOString() });
});

// 5. SYSTEM ADMIN TELEMETRY
app.get('/api/system/health', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      db_latency_ms: Date.now() - dbStart,
      environment: process.env.NODE_ENV,
      node_version: process.version,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// 6. API MODULE ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/fraud', require('./routes/fraud'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/transporters', require('./routes/transporters'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/verify', require('./routes/verify'));

// 7. PRODUCTION FRONTEND SERVING
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '../client/build/index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
  });
}

// 8. GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'SERVER_ERROR'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Agri-Fraud Server Live on Port ${PORT}`);
});

module.exports = app;
