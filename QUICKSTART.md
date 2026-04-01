# Quick Start Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Installation (5 minutes)

### 1. Install Dependencies
```bash
npm install
cd client && npm install && cd ..
```

### 2. Setup Database
```bash
# Create database
createdb agri_fraud_db

# Or using psql
psql -U postgres
CREATE DATABASE agri_fraud_db;
\q
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
nano .env
```

### 4. Initialize Database
```bash
npm run migrate
npm run seed  # Optional: Load sample data
```

### 5. Start Application
```bash
# Development mode (recommended for first run)
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client && npm start
```

OR use the automated script:
```bash
chmod +x start.sh
./start.sh
```

## Access the Application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:5000
- **API Docs**: http://localhost:5000/api-docs

## Demo Login Credentials

After running `npm run seed`, use these credentials:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@agri.com | password123 |
| Inspector | inspector1@agri.com | password123 |
| Fraud Analyst | analyst1@agri.com | password123 |
| Transporter | transporter1@agri.com | password123 |
| Buyer | buyer1@agri.com | password123 |

## Quick Test Workflow

1. **Login** as inspector (inspector1@agri.com)
2. **Create a batch** of produce
3. **Issue a certificate** for the batch
4. **Login** as analyst (analyst1@agri.com)
5. **Run fraud scan** from Fraud Dashboard
6. **View fraud flags** if any detected
7. **Scan QR code** to verify certificate

## Common Commands

```bash
# Start development servers
npm run dev:full

# Run fraud detection
npm run fraud:scan

# View logs
tail -f logs/app.log

# Reset database
npm run migrate

# Production build
npm run build
npm start
```

## Troubleshooting

### Database connection error
```bash
# Check PostgreSQL is running
pg_isready

# Check credentials in .env match your PostgreSQL setup
```

### Port already in use
```bash
# Kill process on port 5000
lsof -i :5000
kill -9 <PID>
```

### Module not found
```bash
# Reinstall dependencies
rm -rf node_modules client/node_modules
npm install
cd client && npm install
```

## Next Steps

1. Read `API_DOCUMENTATION.md` for API details
2. See `DEPLOYMENT.md` for production deployment
3. Check `README.md` for full documentation

## Need Help?

- Check logs in `logs/` directory
- Review `server/server.js` for backend configuration
- Inspect browser console for frontend errors

## Demo Features to Try

1. **Certificate Verification**: Issue a certificate and scan its QR code
2. **Fraud Detection**: Create duplicate certificates to trigger reuse detection
3. **Investigation**: Create a case from a fraud flag and close it
4. **Audit Trail**: View all system activities in audit logs
5. **Shipment Tracking**: Create shipments and update their status

Enjoy using the Agriculture Fraud Detection System! 🌾
