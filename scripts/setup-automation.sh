#!/bin/bash

# VitrineAlu Marketing Automation Setup Script
# This script sets up the complete end-to-end automation system

set -e

echo "🚀 Setting up VitrineAlu Marketing Automation System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ] || [ ! -d "apps" ]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is required but not installed.${NC}" >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}❌ Docker Compose is required but not installed.${NC}" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo -e "${RED}❌ pnpm is required but not installed.${NC}" >&2; exit 1; }

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Environment setup
echo -e "${BLUE}🔧 Setting up environment...${NC}"

if [ ! -f "infra/env/.env" ]; then
    echo -e "${YELLOW}⚠️  Creating .env file from template...${NC}"
    cp infra/env/.env.example infra/env/.env
    echo -e "${YELLOW}📝 Please edit infra/env/.env with your API keys and configuration${NC}"
fi

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# Build packages
echo -e "${BLUE}🔨 Building packages...${NC}"
pnpm build

# Start infrastructure services
echo -e "${BLUE}🐳 Starting infrastructure services...${NC}"
docker-compose -f infra/compose/docker-compose.yml up -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 30

# Check service health
echo -e "${BLUE}🏥 Checking service health...${NC}"

# Check n8n
if curl -f -s http://localhost:5678/healthz > /dev/null 2>&1; then
    echo -e "${GREEN}✅ n8n is running${NC}"
else
    echo -e "${YELLOW}⚠️  n8n may still be starting up${NC}"
fi

# Check worker API
if curl -f -s http://localhost:3001/healthz > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Worker API is running${NC}"
else
    echo -e "${YELLOW}⚠️  Worker API may still be starting up${NC}"
fi

# Import n8n workflows
echo -e "${BLUE}📥 Setting up n8n workflows...${NC}"

# Wait a bit more for n8n to be fully ready
sleep 10

echo -e "${BLUE}🔄 Importing workflows into n8n...${NC}"
echo "Please import the following workflow files manually in the n8n UI at http://localhost:5678:"
echo "  - n8n/workflows/main-automation-pipeline.json"
echo "  - n8n/workflows/weekly-digest-approval.json" 
echo "  - n8n/workflows/metrics-collection-reporting.json"

# Create required directories
echo -e "${BLUE}📁 Creating required directories...${NC}"
mkdir -p assets/source/incoming
mkdir -p assets/ready
mkdir -p assets/renders
mkdir -p media/curated

echo -e "${GREEN}🎉 Setup complete!${NC}"

echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Edit infra/env/.env with your API keys:"
echo "   - GEMINI_API_KEY"
echo "   - OPENAI_API_KEY"
echo "   - BUFFER_ACCESS_TOKEN"
echo "   - SMTP_URL"
echo "   - GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"
echo ""
echo "2. Access the services:"
echo "   - n8n: http://localhost:5678"
echo "   - Worker API: http://localhost:3001"
echo "   - Approvals UI: http://localhost:3000"
echo ""
echo "3. Import workflows in n8n UI"
echo ""
echo "4. Test the system by dropping photos into assets/source/incoming/"
echo ""
echo -e "${GREEN}🚀 Your VitrineAlu automation system is ready!${NC}"