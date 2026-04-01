const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});
app.use('/api/', limiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/fraud', require('./routes/fraud'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/verify', require('./routes/verify'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API documentation
app.get('/api-docs', (req, res) => {
  res.json({
    name: 'Agriculture Fraud Detection API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user'
      },
      batches: {
        'GET /api/batches': 'List all batches',
        'POST /api/batches': 'Create new batch',
        'GET /api/batches/:id': 'Get batch details'
      },
      certificates: {
        'GET /api/certificates': 'List certificates',
        'POST /api/certificates': 'Issue certificate',
        'GET /api/certificates/:id': 'Get certificate details'
      },
      shipments: {
        'GET /api/shipments': 'List shipments',
        'POST /api/shipments': 'Create shipment',
        'PUT /api/shipments/:id': 'Update shipment'
      },
      fraud: {
        'GET /api/fraud/flags': 'List fraud flags',
        'GET /api/fraud/dashboard': 'Dashboard stats',
        'POST /api/fraud/scan': 'Trigger fraud scan'
      },
      cases: {
        'GET /api/cases': 'List cases',
        'POST /api/cases': 'Create case',
        'PUT /api/cases/:id': 'Update case',
        'POST /api/cases/:id/close': 'Close case'
      },
      verify: {
        'GET /api/verify/:qrCode': 'Verify certificate'
      }
    }
  });
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
🌾 Agriculture Fraud Detection System
🚀 Server running on port ${PORT}
📊 Environment: ${process.env.NODE_ENV || 'development'}
🔗 API: http://localhost:${PORT}
📖 Docs: http://localhost:${PORT}/api-docs
  `);
});

module.exports = app;
