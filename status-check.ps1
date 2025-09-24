param(
    [switch]$Detailed
)

Write-Host "=== VitrineAlu All-Day Testing Status ===" -ForegroundColor Cyan
Write-Host "Current Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host ""

# Check running PowerShell jobs
Write-Host "🔄 Active PowerShell Jobs:" -ForegroundColor Yellow
try {
    $jobs = Get-Job -ErrorAction SilentlyContinue
    if ($jobs) {
        foreach ($job in $jobs) {
            $status = switch ($job.State) {
                "Running" { "🟢" }
                "Completed" { "✅" }
                "Failed" { "❌" }
                "Stopped" { "⏹" }
                default { "⚪" }
            }
            Write-Host "  $status Job ID $($job.Id): $($job.Name) - $($job.State)" -ForegroundColor Green
        }
    } else {
        Write-Host "  No PowerShell jobs found in current session" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Could not retrieve job information" -ForegroundColor Red
}

Write-Host ""

# Check running PowerShell processes
Write-Host "💻 PowerShell Processes:" -ForegroundColor Yellow
try {
    $processes = Get-Process powershell -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            $memoryMB = [math]::Round($proc.WorkingSet / 1MB, 1)
            $cpuTime = if ($proc.CPU) { [math]::Round($proc.CPU, 2) } else { "0" }
            Write-Host "  🖥 PID $($proc.Id): CPU ${cpuTime}s, Memory ${memoryMB}MB" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  Could not retrieve process information" -ForegroundColor Red
}

Write-Host ""

# Check Docker services
Write-Host "🐳 Docker Services:" -ForegroundColor Yellow
try {
    $dockerServices = docker ps --format "{{.Names}}\t{{.Status}}" 2>$null
    if ($dockerServices) {
        $serviceLines = $dockerServices -split "`n"
        foreach ($line in $serviceLines) {
            if ($line.Trim()) {
                $parts = $line -split "`t"
                if ($parts.Count -ge 2) {
                    $name = $parts[0]
                    $status = $parts[1]
                    if ($status -like "*healthy*" -or $status -like "*Up*") {
                        Write-Host "  ✅ $name - $status" -ForegroundColor Green
                    } else {
                        Write-Host "  ⚠ $name - $status" -ForegroundColor Yellow
                    }
                }
            }
        }
    } else {
        Write-Host "  No Docker services running" -ForegroundColor Red
    }
} catch {
    Write-Host "  Could not check Docker services" -ForegroundColor Red
}

Write-Host ""

# Check for log files
Write-Host "📝 Log Files:" -ForegroundColor Yellow
try {
    $logFiles = Get-ChildItem -Path "." -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if ($logFiles) {
        foreach ($log in $logFiles) {
            $sizeKB = [math]::Round($log.Length / 1KB, 1)
            $age = (Get-Date) - $log.LastWriteTime
            $ageStr = if ($age.TotalMinutes -lt 60) {
                "$([math]::Round($age.TotalMinutes, 0)) min ago"
            } else {
                "$([math]::Round($age.TotalHours, 1)) hrs ago"
            }
            Write-Host "  📄 $($log.Name) - ${sizeKB}KB (updated $ageStr)" -ForegroundColor Green
        }
    } else {
        Write-Host "  No log files found in current directory" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Could not check log files" -ForegroundColor Red
}

Write-Host ""

# System resource overview
Write-Host "💻 System Resources:" -ForegroundColor Yellow
try {
    # Get disk space
    $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='E:'"
    if ($disk) {
        $freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
        $totalGB = [math]::Round($disk.Size / 1GB, 1)
        $usedPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        Write-Host "  💾 Disk E: ${freeGB}GB free of ${totalGB}GB (${usedPercent}% used)" -ForegroundColor Green
    }
    
    # Get memory info
    $memory = Get-WmiObject -Class Win32_OperatingSystem
    if ($memory) {
        $totalMemGB = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 1)
        $freeMemGB = [math]::Round($memory.FreePhysicalMemory / 1MB, 1)
        $usedMemGB = $totalMemGB - $freeMemGB
        $memUsedPercent = [math]::Round(($usedMemGB / $totalMemGB) * 100, 1)
        Write-Host "  🧠 Memory: ${usedMemGB}GB used of ${totalMemGB}GB (${memUsedPercent}%)" -ForegroundColor Green
    }
} catch {
    Write-Host "  Could not retrieve system resource information" -ForegroundColor Red
}

Write-Host ""

# Check if detailed output is requested
if ($Detailed) {
    Write-Host "📊 Detailed Information:" -ForegroundColor Yellow
    
    # Check for specific testing scripts
    $testScripts = @("continuous-testing.ps1", "stress-testing.ps1", "monitoring-dashboard.ps1")
    foreach ($script in $testScripts) {
        if (Test-Path $script) {
            Write-Host "  ✅ $script exists" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $script missing" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    
    # Show recent log entries if available
    $recentLog = Get-ChildItem -Path "." -Filter "*testing*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($recentLog) {
        Write-Host "📋 Recent Log Entries from $($recentLog.Name):" -ForegroundColor Yellow
        try {
            $lastLines = Get-Content $recentLog.FullName -Tail 10 -ErrorAction SilentlyContinue
            foreach ($line in $lastLines) {
                Write-Host "  $line" -ForegroundColor Gray
            }
        } catch {
            Write-Host "  Could not read log file" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Status check completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Use 'status-check.ps1 -Detailed' for more information" -ForegroundColor Gray