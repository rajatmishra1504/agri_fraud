# 🌾 Agriculture Fraud Detection System

A comprehensive web system for detecting and investigating fraud in agricultural supply chains, including certificate fraud, impossible travel times, double deliveries, and suspicious patterns.

## 🎯 Features

### Core Functionality
- **Certificate Management**: Issue and verify digital certificates with PDF upload and cryptographic hashing
- **QR Code Verification**: Public verification page for buyers to scan and verify certificate authenticity
- **Fraud Detection Engine**: Multi-layered detection with rule-based and ML anomaly detection
- **Investigation Dashboard**: Comprehensive fraud analysis with evidence timelines
- **Case Management**: Full workflow from flag detection to analyst decision
- **Audit Logging**: Complete tracking of all system actions

### Fraud Detection Rules
1. **Certificate Reuse** (HIGH): Same certificate hash used for multiple batches
2. **Double Delivery** (HIGH): Same batch delivered twice to different locations
3. **Impossible Travel** (MED/HIGH): Delivery time < minimum travel time based on distance
4. **Abnormal Weight Change** (MED): Weight variance beyond acceptable thresholds
5. **Inspector Anomaly** (LOW/MED): Suspicious inspector grading patterns
6. **ML Anomaly Detection**: Isolation Forest for pattern anomalies

## 🏗️ Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL with full ACID compliance
- **Frontend**: React (Create React App)
- **Authentication**: JWT tokens
- **File Storage**: AWS S3 / Local storage
- **Deployment**: Docker + AWS EC2 / Railway / Render

### Database Schema
```
users (id, email, password_hash, role, name, created_at)
batches (id, farm_name, product_type, quantity_kg, harvest_date, created_by)
certificates (id, batch_id, cert_hash, pdf_url, qr_code, issued_by, issued_at)
shipments (id, batch_id, from_location, to_location, distance_km, shipped_at, delivered_at, weight_kg, status)
fraud_flags (id, flag_type, severity, batch_id, cert_id, shipment_id, evidence_json, status, created_at)
fraud_cases (id, flag_id, assigned_to, notes, decision, closed_at, created_at)
audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- AWS Account (for S3) or local storage
- Docker (optional)

### Installation

1. **Clone and Install**
```bash
cd agri_fraud
npm install
cd client && npm install && cd ..
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your database and AWS credentials
```

3. **Database Setup**
```bash
# Create database
createdb agri_fraud_db

# Run migrations
npm run migrate

# Seed sample data (optional)
npm run seed
```

4. **Start Development**
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client && npm start
```

5. **Access Application**
- Frontend: https://agri-fraud-server.onrender.com (Production)
- API Base: https://agri-fraud-server.onrender.com/api
- Live API Docs: https://agri-fraud-server.onrender.com/api-docs
- Local Development: http://localhost:5000/api-docs
- File Documentation: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## 📦 Deployment

### Docker Deployment
```bash
docker-compose up -d
```

### AWS EC2 Deployment
```bash
# Build and deploy
npm run build
npm run deploy:aws
```

### Railway/Render
- Push to GitHub
- Connect repository to Railway/Render
- Set environment variables
- Deploy automatically

## 🔐 User Roles

1. **Inspector**: Issue certificates, upload PDFs
2. **Transporter**: Update shipment status and events
3. **Buyer**: Verify certificates via QR codes
4. **Fraud Analyst**: Investigate flags, manage cases
5. **Admin/Auditor**: Monitor system, view audit logs

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Certificates
- `POST /api/certificates` - Issue new certificate
- `GET /api/certificates/:id` - Get certificate details
- `GET /api/verify/:qrCode` - Public verification endpoint

### Batches
- `POST /api/batches` - Create new batch
- `GET /api/batches` - List all batches
- `GET /api/batches/:id` - Get batch details

### Shipments
- `POST /api/shipments` - Create shipment
- `PUT /api/shipments/:id` - Update shipment status

### Fraud Detection
- `GET /api/fraud/flags` - List all fraud flags
- `GET /api/fraud/dashboard` - Dashboard statistics
- `POST /api/fraud/scan` - Trigger manual fraud scan

### Cases
- `POST /api/cases` - Create investigation case
- `PUT /api/cases/:id` - Update case
- `POST /api/cases/:id/close` - Close case with decision

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 📈 Monitoring

- **Application Logs**: Winston logging to files and console
- **Database Monitoring**: PostgreSQL slow query logs
- **Error Tracking**: Integrated error reporting
- **Performance**: Request timing middleware

## 🔒 Security Features

- Password hashing with bcrypt
- JWT authentication
- SQL injection prevention (parameterized queries)
- XSS protection (input sanitization)
- CORS configuration
- Rate limiting on API endpoints
- Certificate hash verification (SHA-256)

## 📝 License

MIT License - See LICENSE file for details

## 👥 Team

This project was developed as part of the Advanced Database Management Systems course.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request
