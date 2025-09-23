# VitrineAlu Marketing Automation Setup Script (PowerShell)
# This script sets up the complete end-to-end automation system

param(
    [switch]$SkipBuild,
    [switch]$Force
)

Write-Host "🚀 Setting up VitrineAlu Marketing Automation System..." -ForegroundColor Blue

# Check if running from project root
if (!(Test-Path "package.json") -or !(Test-Path "apps")) {
    Write-Host "❌ Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Checking prerequisites..." -ForegroundColor Blue

# Check for required tools
$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
$pnpmInstalled = Get-Command pnpm -ErrorAction SilentlyContinue

if (!$dockerInstalled) {
    Write-Host "❌ Docker is required but not installed." -ForegroundColor Red
    exit 1
}

if (!$pnpmInstalled) {
    Write-Host "❌ pnpm is required but not installed." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green

# Environment setup
Write-Host "🔧 Setting up environment..." -ForegroundColor Blue

$envPath = "infra/env/.env"
$envExamplePath = "infra/env/.env.example"

if (!(Test-Path $envPath)) {
    if (Test-Path $envExamplePath) {
        Write-Host "⚠️  Creating .env file from template..." -ForegroundColor Yellow
        Copy-Item $envExamplePath $envPath
        Write-Host "📝 Please edit infra/env/.env with your API keys and configuration" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  No .env.example found, creating basic .env file..." -ForegroundColor Yellow
        @"
# VitrineAlu Marketing Automation Environment Variables

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
AZURE_OPENAI_ENDPOINT=your_azure_endpoint_here
AZURE_OPENAI_KEY=your_azure_key_here

# Buffer Integration
BUFFER_ACCESS_TOKEN=your_buffer_token_here

# Email Configuration
SMTP_URL=smtp://user:pass@host:port
APPROVAL_EMAIL=your_email@domain.com

# Google Drive
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_READY_PARENT_ID=your_drive_folder_id

# Security
APPROVAL_HMAC_SECRET=your_secure_secret_here

# Worker Configuration
WORKER_API_URL=http://localhost:3001
AESTHETIC_THRESHOLD=0.62
BACKGROUND_MODE=clean

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vitrinealu

# Redis
REDIS_URL=redis://localhost:6379
"@ | Out-File -FilePath $envPath -Encoding UTF8
    }
}

# Install dependencies
if (!$SkipBuild) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
    pnpm install

    # Build packages
    Write-Host "🔨 Building packages..." -ForegroundColor Blue
    pnpm build
}

# Start infrastructure services
Write-Host "🐳 Starting infrastructure services..." -ForegroundColor Blue
docker-compose -f infra/compose/docker-compose.yml up -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Blue
Start-Sleep -Seconds 30

# Check service health
Write-Host "🏥 Checking service health..." -ForegroundColor Blue

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5678/healthz" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ n8n is running" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  n8n may still be starting up" -ForegroundColor Yellow
}

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/healthz" -TimeoutSec 5 -ErrorAction SilentlyContinue  
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Worker API is running" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Worker API may still be starting up" -ForegroundColor Yellow
}

# Create required directories
Write-Host "📁 Creating required directories..." -ForegroundColor Blue
$directories = @(
    "assets/source/incoming",
    "assets/ready", 
    "assets/renders",
    "media/curated"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory: $dir" -ForegroundColor Gray
    }
}

Write-Host "🎉 Setup complete!" -ForegroundColor Green

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Blue
Write-Host "1. Edit infra/env/.env with your API keys:" -ForegroundColor White
Write-Host "   - GEMINI_API_KEY" -ForegroundColor Gray
Write-Host "   - OPENAI_API_KEY" -ForegroundColor Gray
Write-Host "   - BUFFER_ACCESS_TOKEN" -ForegroundColor Gray
Write-Host "   - SMTP_URL" -ForegroundColor Gray
Write-Host "   - GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Access the services:" -ForegroundColor White
Write-Host "   - n8n: http://localhost:5678" -ForegroundColor Gray
Write-Host "   - Worker API: http://localhost:3001" -ForegroundColor Gray
Write-Host "   - Approvals UI: http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Import workflows in n8n UI:" -ForegroundColor White
Write-Host "   - n8n/workflows/main-automation-pipeline.json" -ForegroundColor Gray
Write-Host "   - n8n/workflows/weekly-digest-approval.json" -ForegroundColor Gray
Write-Host "   - n8n/workflows/metrics-collection-reporting.json" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Test the system by dropping photos into assets/source/incoming/" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Your VitrineAlu automation system is ready!" -ForegroundColor Green

# Open services in browser (Windows)
if ($Force -or (Read-Host "Open services in browser? (y/N)") -eq "y") {
    Start-Process "http://localhost:5678"  # n8n
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3001"  # Worker API  
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"  # Approvals UI
}