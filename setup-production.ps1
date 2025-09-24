#!/usr/bin/env pwsh
# Phase 7: Production Environment Setup Script
# Run this script to configure the production environment

param(
    [string]$OpenAIKey = "",
    [string]$GeminiKey = "",
    [string]$BufferToken = "",
    [string]$SmtpPassword = "",
    [string]$ApprovalSecret = "",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
VitrineAlu Marketing Automation - Production Setup

Usage: .\setup-production.ps1 [parameters]

Required Parameters:
  -OpenAIKey     Your OpenAI API key (sk-...)
  -GeminiKey     Your Google Gemini API key  
  -BufferToken   Your Buffer API access token
  -SmtpPassword  Your email app password for SMTP
  -ApprovalSecret A strong random secret for approval security

Example:
  .\setup-production.ps1 -OpenAIKey "sk-..." -GeminiKey "..." -BufferToken "..." -SmtpPassword "..." -ApprovalSecret "strong-random-secret"

"@
    exit 0
}

Write-Host "🚀 VitrineAlu Marketing Automation - Phase 7 Production Setup" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "docker-compose.yml") -or !(Test-Path "config/brand.yaml")) {
    Write-Error "Please run this script from the project root directory (where docker-compose.yml exists)"
    exit 1
}

# Validate required parameters
$missing = @()
if ([string]::IsNullOrEmpty($OpenAIKey)) { $missing += "OpenAIKey" }
if ([string]::IsNullOrEmpty($GeminiKey)) { $missing += "GeminiKey" }
if ([string]::IsNullOrEmpty($BufferToken)) { $missing += "BufferToken" }
if ([string]::IsNullOrEmpty($SmtpPassword)) { $missing += "SmtpPassword" }
if ([string]::IsNullOrEmpty($ApprovalSecret)) { $missing += "ApprovalSecret" }

if ($missing.Count -gt 0) {
    Write-Error "Missing required parameters: $($missing -join ', ')"
    Write-Host "Run with -Help for usage information"
    exit 1
}

Write-Host "✅ All required parameters provided" -ForegroundColor Green

# Create production .env file
Write-Host ""
Write-Host "📝 Creating production .env file..." -ForegroundColor Yellow

$envContent = @"
# VitrineAlu Marketing Automation - Production Environment
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Core AI Services (REQUIRED)
OPENAI_API_KEY=$OpenAIKey
GEMINI_API_KEY=$GeminiKey

# Social Media Integration (REQUIRED)  
BUFFER_TOKEN=$BufferToken

# Email for Weekly Digest (REQUIRED)
SMTP_URL=smtp://vitrinealu.automation:$SmtpPassword@smtp.gmail.com:587
APPROVAL_HMAC_SECRET=$ApprovalSecret

# Google Drive Integration (placeholder - configure manually)
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project"}
GOOGLE_READY_PARENT_ID=your-google-drive-folder-id

# Optional Enhanced Services (configure if available)
AZURE_OPENAI_ENDPOINT=https://your-azure-endpoint.openai.azure.com
AZURE_OPENAI_KEY=your-azure-openai-key  
RUNWAY_API_KEY=your-runway-api-key
PIKA_API_KEY=your-pika-api-key

# System Configuration
PUBLIC_BASE_URL=https://vitrinealu.localhost
WIX_WEBHOOK_SECRET=wix-webhook-secret-if-using

# Database & Cache
DATABASE_URL=postgresql://postgres:postgres@db:5432/vitrinealu
REDIS_URL=redis://cache:6379

# Paths & Configuration
BRAND_CONFIG=/config/brand.yaml
SCHEDULE_CONFIG=/config/schedule.yaml  
PROVIDERS_CONFIG=/config/providers.yaml
ASSETS_ROOT=/workspace/assets

# Email Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=vitrinealu.automation@gmail.com
MAIL_PASS=$SmtpPassword
MAIL_FROM="VitrineAlu Marketing <vitrinealu.automation@gmail.com>"

# Logging
LOG_LEVEL=info
NODE_ENV=production
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host "✅ Created .env file with production configuration" -ForegroundColor Green

# Create infra env file too
if (!(Test-Path "infra/env")) {
    New-Item -ItemType Directory -Path "infra/env" -Force | Out-Null
}
$envContent | Out-File -FilePath "infra/env/.env" -Encoding UTF8
Write-Host "✅ Created infra/env/.env file" -ForegroundColor Green

# Check Docker is running
Write-Host ""
Write-Host "🐳 Checking Docker status..." -ForegroundColor Yellow
try {
    $dockerVersion = docker version --format "{{.Server.Version}}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not running"
    }
    Write-Host "✅ Docker is running (version: $dockerVersion)" -ForegroundColor Green
} catch {
    Write-Error "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
}

# Build and start services
Write-Host ""
Write-Host "🏗️  Building and starting production services..." -ForegroundColor Yellow

try {
    # Use the main docker-compose.yml file
    docker compose up -d --build 2>&1 | Out-Host
    
    if ($LASTEXITCODE -ne 0) {
        throw "Docker compose failed"
    }
    
    Write-Host "✅ All services started successfully!" -ForegroundColor Green
    
} catch {
    Write-Error "❌ Failed to start services. Check Docker logs for details."
    Write-Host "Debug: docker compose logs" -ForegroundColor Yellow
    exit 1
}

# Check service health
Write-Host ""
Write-Host "🔍 Checking service health..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$services = docker compose ps --format "table {{.Service}}\t{{.Status}}" 2>$null
Write-Host $services

Write-Host ""
Write-Host "🎉 Production Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Configure Google Drive service account in .env file"
Write-Host "2. Access n8n at: http://localhost:5678"
Write-Host "3. Import workflows from n8n/workflows/ directory"
Write-Host "4. Test with sample photos in assets/source/incoming/"
Write-Host "5. Begin weekly approval workflow"
Write-Host ""
Write-Host "System URLs:" -ForegroundColor Cyan
Write-Host "- n8n Orchestrator: http://localhost:5678"
Write-Host "- Worker API: http://localhost:8080" 
Write-Host "- Database: postgresql://postgres:postgres@localhost:5432/vitrinealu"
Write-Host ""
Write-Host "🚀 Your automated marketing system is now live!" -ForegroundColor Green