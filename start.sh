#!/bin/bash

echo "🌾 Starting Agriculture Fraud Detection System..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env with your configuration"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready -h localhost > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
cd client && npm install && cd ..

# Run migrations
echo "🗄️  Running database migrations..."
npm run migrate

# Ask about seed data
read -p "Load sample data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run seed
fi

# Build frontend
echo "🏗️  Building frontend..."
cd client && npm run build && cd ..

# Start application
echo "🚀 Starting server..."
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000"
echo "  API Docs: http://localhost:5000/api-docs"
echo ""

# Start both servers
npm run dev:full
