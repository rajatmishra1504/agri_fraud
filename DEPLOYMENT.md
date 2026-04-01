# Deployment Guide

## Quick Start with Docker

1. **Prerequisites**
   - Docker and Docker Compose installed
   - Git (optional)

2. **Clone and Start**
   ```bash
   git clone <repository-url>
   cd agri-fraud-detection
   docker-compose up -d
   ```

3. **Access Application**
   - Frontend: http://localhost:5000
   - API: http://localhost:5000/api
   - Database: localhost:5432

## AWS EC2 Deployment

### 1. Launch EC2 Instance
- Amazon Linux 2 or Ubuntu 20.04
- t2.medium or larger
- Security groups: Allow ports 22, 80, 443, 5000

### 2. Install Dependencies
```bash
# Update system
sudo yum update -y  # Amazon Linux
# OR
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs  # Amazon Linux
# OR
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs  # Ubuntu

# Install PostgreSQL
sudo yum install -y postgresql postgresql-server  # Amazon Linux
# OR
sudo apt install -y postgresql postgresql-contrib  # Ubuntu

# Install PM2
sudo npm install -g pm2
```

### 3. Setup Database
```bash
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE agri_fraud_db;
CREATE USER agriuser WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE agri_fraud_db TO agriuser;
\q
```

### 4. Deploy Application
```bash
# Clone repository
git clone <repository-url>
cd agri-fraud-detection

# Install dependencies
npm install
cd client && npm install && npm run build && cd ..

# Setup environment
cp .env.example .env
nano .env  # Edit with your credentials

# Run migrations
npm run migrate
npm run seed  # Optional: Load sample data

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Setup Nginx (Optional)
```bash
sudo yum install -y nginx  # Amazon Linux
# OR
sudo apt install -y nginx  # Ubuntu

sudo nano /etc/nginx/conf.d/agri-fraud.conf
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

## Railway Deployment

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Initialize**
   ```bash
   railway login
   railway init
   ```

3. **Add PostgreSQL**
   ```bash
   railway add postgresql
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Set Environment Variables** (in Railway dashboard)
   - All variables from .env.example
   - Use Railway-provided DATABASE_URL

## Render Deployment

1. **Create New Web Service**
   - Connect GitHub repository
   - Build Command: `npm install && cd client && npm install && npm run build`
   - Start Command: `npm run migrate && npm start`

2. **Add PostgreSQL Database**
   - Create new PostgreSQL instance
   - Copy Internal Database URL

3. **Set Environment Variables**
   - Add all from .env.example
   - Use Render-provided DATABASE_URL

## Post-Deployment

### 1. Verify Installation
```bash
curl http://your-domain.com/health
```

### 2. Create Admin User
```bash
curl -X POST http://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "SecurePassword123",
    "name": "Admin User",
    "role": "admin"
  }'
```

### 3. Run Initial Fraud Scan
```bash
curl -X POST http://your-domain.com/api/fraud/scan \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Setup Cron Job
Add to crontab:
```bash
0 2 * * * cd /path/to/agri-fraud-detection && node server/jobs/fraudScan.js
```

## Monitoring

### View Logs
```bash
pm2 logs agri-fraud-api
```

### Monitor Performance
```bash
pm2 monit
```

### Database Backup
```bash
pg_dump -U postgres agri_fraud_db > backup_$(date +%Y%m%d).sql
```

## Troubleshooting

### Database Connection Issues
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify credentials in .env
- Check pg_hba.conf for access permissions

### Port Already in Use
```bash
lsof -i :5000
kill -9 <PID>
```

### Build Failures
- Clear cache: `npm cache clean --force`
- Remove node_modules: `rm -rf node_modules client/node_modules`
- Reinstall: `npm install && cd client && npm install`

## Security Checklist

- [ ] Change default JWT_SECRET
- [ ] Update database passwords
- [ ] Enable HTTPS with SSL certificate
- [ ] Setup firewall rules
- [ ] Enable rate limiting
- [ ] Regular security updates
- [ ] Backup database regularly
- [ ] Monitor logs for suspicious activity

## Scaling

### Horizontal Scaling
- Use load balancer (AWS ALB, Nginx)
- Run multiple app instances with PM2 cluster mode
- Use managed PostgreSQL (RDS, Aurora)

### Performance Optimization
- Enable Redis caching
- CDN for static assets
- Database indexing and query optimization
- Compress responses with gzip

For support, contact: support@yourcompany.com
