FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache \
    postgresql-client \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install backend dependencies with legacy peer deps flag
RUN npm install --legacy-peer-deps || npm install --force

# Copy client package files
COPY client/package*.json ./client/

# Install frontend dependencies
RUN cd client && npm install --legacy-peer-deps || npm install --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads/certificates logs

# Build React app
RUN cd client && npm run build

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server/server.js"]
