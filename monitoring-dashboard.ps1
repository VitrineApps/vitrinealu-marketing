#!/usr/bin/env pwsh
# VitrineAlu Marketing Automation - Real-time Monitoring Dashboard
# Displays live system status and metrics

param(
    [int]$RefreshSeconds = 30,
    [switch]$SaveMetrics
)

$ErrorActionPreference = "Continue"

function Get-ServiceStatus {
    try {
        $services = docker compose ps --format "{{.Service}};{{.Status}};{{.Health}}" 2>$null
        $status = @{}
        
        foreach ($line in $services) {
            $parts = $line -split ";"
            if ($parts.Length -ge 2) {
                $service = $parts[0]
                $state = $parts[1]
                $health = if ($parts.Length -ge 3) { $parts[2] } else { "unknown" }
                
                $status[$service] = @{
                    State = $state
                    Health = $health
                    Status = if ($state -match "running|Up") { "✅" } else { "❌" }
                }
            }
        }
        return $status
    } catch {
        return @{}
    }
}

function Get-SystemMetrics {
    try {
        $metrics = @{
            Timestamp = Get-Date
            Uptime = $null
            Memory = $null
            CPU = $null
            Disk = $null
            Containers = @{}
        }
        
        # Get container stats
        $containerStats = docker stats --no-stream --format "{{.Container}};{{.CPUPerc}};{{.MemUsage}};{{.MemPerc}}" 2>$null
        
        foreach ($line in $containerStats) {
            $parts = $line -split ";"
            if ($parts.Length -ge 4) {
                $container = $parts[0]
                $metrics.Containers[$container] = @{
                    CPU = $parts[1]
                    Memory = $parts[2]
                    MemoryPercent = $parts[3]
                }
            }
        }
        
        # Get disk usage
        $diskInfo = Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object -First 1
        if ($diskInfo) {
            $freeSpaceGB = [math]::Round($diskInfo.FreeSpace / 1GB, 2)
            $totalSpaceGB = [math]::Round($diskInfo.Size / 1GB, 2)
            $percentFree = [math]::Round(($diskInfo.FreeSpace / $diskInfo.Size) * 100, 1)
            
            $metrics.Disk = @{
                Free = $freeSpaceGB
                Total = $totalSpaceGB
                PercentFree = $percentFree
            }
        }
        
        return $metrics
    } catch {
        return $null
    }
}

function Test-QuickHealthCheck {
    $health = @{
        Database = $false
        Cache = $false
        N8N = $false
        FileSystem = $false
    }
    
    # Quick database check
    try {
        $dbTest = docker compose exec -T db pg_isready -U postgres 2>$null
        $health.Database = $LASTEXITCODE -eq 0
    } catch { }
    
    # Quick cache check
    try {
        $cacheTest = docker compose exec -T cache redis-cli ping 2>$null
        $health.Cache = $cacheTest -match "PONG"
    } catch { }
    
    # Quick n8n check
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 5 -UseBasicParsing
        $health.N8N = $response.StatusCode -eq 200
    } catch { }
    
    # Quick file system check
    try {
        $health.FileSystem = (Test-Path "assets") -and (Test-Path "config")
    } catch { }
    
    return $health
}

function Show-Dashboard {
    param($Services, $Metrics, $Health)
    
    Clear-Host
    
    Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                    VitrineAlu Marketing Automation Monitor                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    
    $currentTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "🕒 Current Time: $currentTime" -ForegroundColor White
    Write-Host ""
    
    # Service Status
    Write-Host "🐳 Docker Services Status:" -ForegroundColor Yellow
    Write-Host "─────────────────────────────" -ForegroundColor Yellow
    
    if ($Services.Count -gt 0) {
        foreach ($service in $Services.GetEnumerator()) {
            $statusIcon = $service.Value.Status
            $healthInfo = if ($service.Value.Health -ne "unknown") { " ($($service.Value.Health))" } else { "" }
            Write-Host "  $statusIcon $($service.Key.PadRight(15)) $($service.Value.State)$healthInfo" -ForegroundColor White
        }
    } else {
        Write-Host "  ❌ No services detected or Docker not available" -ForegroundColor Red
    }
    
    Write-Host ""
    
    # Health Checks
    Write-Host "🏥 System Health Checks:" -ForegroundColor Yellow
    Write-Host "─────────────────────────" -ForegroundColor Yellow
    
    foreach ($check in $Health.GetEnumerator()) {
        $icon = if ($check.Value) { "✅" } else { "❌" }
        $color = if ($check.Value) { "Green" } else { "Red" }
        Write-Host "  $icon $($check.Key.PadRight(12))" -ForegroundColor $color -NoNewline
        Write-Host " $(if ($check.Value) { "Healthy" } else { "Issues Detected" })" -ForegroundColor $color
    }
    
    Write-Host ""
    
    # System Metrics
    if ($Metrics) {
        Write-Host "📊 System Metrics:" -ForegroundColor Yellow
        Write-Host "──────────────────" -ForegroundColor Yellow
        
        if ($Metrics.Disk) {
            $diskColor = if ($Metrics.Disk.PercentFree -lt 10) { "Red" } elseif ($Metrics.Disk.PercentFree -lt 20) { "Yellow" } else { "Green" }
            Write-Host "  💾 Disk Space: $($Metrics.Disk.Free) GB free of $($Metrics.Disk.Total) GB ($($Metrics.Disk.PercentFree)%)" -ForegroundColor $diskColor
        }
        
        if ($Metrics.Containers.Count -gt 0) {
            Write-Host "  🔧 Container Resources:" -ForegroundColor White
            foreach ($container in $Metrics.Containers.GetEnumerator()) {
                Write-Host "    📦 $($container.Key): CPU $($container.Value.CPU), Memory $($container.Value.Memory)" -ForegroundColor Gray
            }
        }
        
        Write-Host ""
    }
    
    # File System Status
    Write-Host "📁 File System Status:" -ForegroundColor Yellow
    Write-Host "──────────────────────" -ForegroundColor Yellow
    
    $directories = @(
        "assets/source/incoming",
        "assets/ready", 
        "assets/renders",
        "config",
        "workflows/n8n"
    )
    
    foreach ($dir in $directories) {
        $exists = Test-Path $dir
        $icon = if ($exists) { "✅" } else { "❌" }
        $color = if ($exists) { "Green" } else { "Red" }
        
        if ($exists) {
            $fileCount = (Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Measure-Object).Count
            Write-Host "  $icon $($dir.PadRight(25)) ($fileCount files)" -ForegroundColor $color
        } else {
            Write-Host "  $icon $($dir.PadRight(25)) (missing)" -ForegroundColor $color
        }
    }
    
    Write-Host ""
    
    # Quick Stats
    $healthyChecks = ($Health.Values | Where-Object { $_ -eq $true }).Count
    $totalChecks = $Health.Count
    $healthPercentage = if ($totalChecks -gt 0) { [math]::Round(($healthyChecks / $totalChecks) * 100, 1) } else { 0 }
    
    $runningServices = ($Services.Values | Where-Object { $_.Status -eq "✅" }).Count
    $totalServices = $Services.Count
    
    Write-Host "📈 Overall Status:" -ForegroundColor Yellow
    Write-Host "─────────────────" -ForegroundColor Yellow
    Write-Host "  🎯 Health Score: $healthyChecks/$totalChecks checks passing ($healthPercentage%)" -ForegroundColor $(if ($healthPercentage -ge 75) { "Green" } else { "Yellow" })
    Write-Host "  🐳 Services: $runningServices/$totalServices running" -ForegroundColor $(if ($runningServices -eq $totalServices -and $totalServices -gt 0) { "Green" } else { "Yellow" })
    
    $overallStatus = if ($healthPercentage -ge 90 -and $runningServices -eq $totalServices) { 
        "🟢 EXCELLENT" 
    } elseif ($healthPercentage -ge 75) { 
        "🟡 GOOD" 
    } else { 
        "🔴 NEEDS ATTENTION" 
    }
    
    Write-Host "  🏆 Overall: $overallStatus" -ForegroundColor White
    Write-Host ""
    
    Write-Host "🔄 Auto-refresh every $RefreshSeconds seconds (Ctrl+C to stop)" -ForegroundColor Gray
    Write-Host "📝 Running continuous tests in background (check continuous-test-results.log)" -ForegroundColor Gray
}

# Main monitoring loop
Write-Host "Starting VitrineAlu Marketing Automation Monitor..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Yellow
Write-Host ""

$metricsHistory = @()

try {
    while ($true) {
        $services = Get-ServiceStatus
        $metrics = Get-SystemMetrics
        $health = Test-QuickHealthCheck
        
        Show-Dashboard -Services $services -Metrics $metrics -Health $health
        
        if ($SaveMetrics -and $metrics) {
            $metricsHistory += $metrics
            
            # Keep only last 100 entries
            if ($metricsHistory.Count -gt 100) {
                $metricsHistory = $metricsHistory[-100..-1]
            }
            
            # Save metrics to file every 10 cycles
            if ($metricsHistory.Count % 10 -eq 0) {
                $metricsHistory | ConvertTo-Json -Depth 3 | Out-File -FilePath "system-metrics-history.json" -Encoding UTF8
            }
        }
        
        Start-Sleep -Seconds $RefreshSeconds
    }
} catch [System.Management.Automation.PipelineStoppedException] {
    Write-Host ""
    Write-Host "Monitoring stopped by user." -ForegroundColor Yellow
} catch {
    Write-Host ""
    Write-Host "Monitoring error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($SaveMetrics -and $metricsHistory.Count -gt 0) {
        $metricsHistory | ConvertTo-Json -Depth 3 | Out-File -FilePath "system-metrics-history.json" -Encoding UTF8
        Write-Host "Metrics history saved to system-metrics-history.json" -ForegroundColor Green
    }
}