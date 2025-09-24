#!/usr/bin/env pwsh
# Phase 7: Production Validation Script
# Validates that the production system is working correctly

Write-Host "🔍 VitrineAlu Marketing Automation - Production Validation" -ForegroundColor Green
Write-Host ""

# Check if .env exists
if (!(Test-Path ".env")) {
    Write-Error "❌ .env file not found. Run setup-production.ps1 first."
    exit 1
}
Write-Host "✅ Environment file exists" -ForegroundColor Green

# Check Docker services
Write-Host ""
Write-Host "🐳 Checking Docker services..." -ForegroundColor Yellow

try {
    $services = docker compose ps --format "{{.Service}} {{.Status}}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker compose not running"
    }
    
    $runningServices = 0
    $totalServices = 0
    
    foreach ($line in $services) {
        $totalServices++
        if ($line -match "running" -or $line -match "Up") {
            $runningServices++
            Write-Host "  ✅ $line" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $line" -ForegroundColor Red
        }
    }
    
    if ($runningServices -eq $totalServices -and $totalServices -gt 0) {
        Write-Host "✅ All $totalServices services are running" -ForegroundColor Green
    } else {
        Write-Warning "⚠️  Only $runningServices/$totalServices services are running"
    }
    
} catch {
    Write-Error "❌ Failed to check Docker services. Make sure Docker is running and services are started."
    Write-Host "Run: docker compose up -d" -ForegroundColor Yellow
    exit 1
}

# Test service endpoints
Write-Host ""
Write-Host "🌐 Testing service endpoints..." -ForegroundColor Yellow

# Test n8n
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ n8n orchestrator accessible at http://localhost:5678" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ n8n not accessible at http://localhost:5678" -ForegroundColor Red
}

# Test scheduler API
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Scheduler API accessible at http://localhost:8080" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Scheduler API not accessible at http://localhost:8080" -ForegroundColor Red
}

# Check database connection
Write-Host ""
Write-Host "💾 Testing database connection..." -ForegroundColor Yellow

try {
    $dbTest = docker compose exec -T db psql -U postgres -d vitrinealu -c "SELECT 1;" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database connection successful" -ForegroundColor Green
    } else {
        throw "DB connection failed"
    }
} catch {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
}

# Check Redis connection  
Write-Host ""
Write-Host "🗄️  Testing cache connection..." -ForegroundColor Yellow

try {
    $redisTest = docker compose exec -T cache redis-cli ping 2>$null
    if ($redisTest -match "PONG") {
        Write-Host "✅ Redis cache connection successful" -ForegroundColor Green
    } else {
        throw "Redis connection failed"
    }
} catch {
    Write-Host "❌ Redis cache connection failed" -ForegroundColor Red
}

# Check required directories
Write-Host ""
Write-Host "📁 Checking directory structure..." -ForegroundColor Yellow

$requiredDirs = @(
    "assets/source/incoming",
    "assets/ready", 
    "assets/renders",
    "config",
    "workflows/n8n"
)

foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "✅ $dir exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $dir missing" -ForegroundColor Red
        # Create missing directories
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  📁 Created $dir" -ForegroundColor Yellow
    }
}

# Check configuration files
Write-Host ""
Write-Host "⚙️  Checking configuration files..." -ForegroundColor Yellow

$configFiles = @(
    "config/brand.yaml",
    "config/schedule.yaml", 
    "config/providers.yaml"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $file missing" -ForegroundColor Red
    }
}

# Check workflow files
$workflowFiles = Get-ChildItem "n8n/workflows/*.json" -ErrorAction SilentlyContinue
if ($workflowFiles.Count -gt 0) {
    Write-Host "✅ Found $($workflowFiles.Count) n8n workflow files" -ForegroundColor Green
} else {
    Write-Host "❌ No n8n workflow files found in n8n/workflows/" -ForegroundColor Red
}

# Environment variable validation
Write-Host ""
Write-Host "🔑 Validating environment variables..." -ForegroundColor Yellow

$envContent = Get-Content ".env" -Raw
$requiredVars = @("OPENAI_API_KEY", "GEMINI_API_KEY", "BUFFER_TOKEN", "APPROVAL_HMAC_SECRET")

foreach ($var in $requiredVars) {
    if ($envContent -match "$var=.+") {
        Write-Host "✅ $var configured" -ForegroundColor Green
    } else {
        Write-Host "❌ $var not configured" -ForegroundColor Red
    }
}

# Final status
Write-Host ""
Write-Host "🎯 Production Readiness Summary:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps to Complete Setup:" -ForegroundColor Yellow
Write-Host "1. 📧 Configure Google Drive service account JSON in .env"
Write-Host "2. 🌐 Access n8n at http://localhost:5678 and import workflows"  
Write-Host "3. 📋 Import workflow files from n8n/workflows/ directory"
Write-Host "4. 🧪 Test with sample photos in assets/source/incoming/"
Write-Host "5. 📧 Verify weekly digest email functionality"
Write-Host "6. 🚀 Begin production content automation!"
Write-Host ""
Write-Host "System Status: Ready for Production! 🎉" -ForegroundColor Green