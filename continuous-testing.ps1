#!/usr/bin/env pwsh
# VitrineAlu Marketing Automation - Continuous Testing Suite
# Runs comprehensive tests throughout the workday with detailed logging

param(
    [int]$TestIntervalMinutes = 15,
    [int]$WorkdayHours = 8,
    [string]$LogFile = "continuous-test-results.log",
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$StartTime = Get-Date
$EndTime = $StartTime.AddHours($WorkdayHours)
$TestNumber = 1

# Create log file with header
$LogHeader = @"
========================================
VitrineAlu Marketing Automation
Continuous Testing Session Started
========================================
Start Time: $($StartTime.ToString("yyyy-MM-dd HH:mm:ss"))
End Time: $($EndTime.ToString("yyyy-MM-dd HH:mm:ss"))
Test Interval: $TestIntervalMinutes minutes
Workday Duration: $WorkdayHours hours
========================================

"@

$LogHeader | Out-File -FilePath $LogFile -Encoding UTF8
$LogHeader | Write-Host -ForegroundColor Green

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [$Level] $Message"
    $LogEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    
    $Color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    
    if ($Verbose -or $Level -ne "INFO") {
        Write-Host $LogEntry -ForegroundColor $Color
    }
}

function Test-DockerServices {
    Write-Log "Testing Docker Services..." "INFO"
    
    try {
        $services = docker compose ps --format "{{.Service}} {{.Status}}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Docker compose not responding" "ERROR"
            return $false
        }
        
        $runningServices = 0
        $totalServices = 0
        
        foreach ($line in $services) {
            $totalServices++
            if ($line -match "running|Up") {
                $runningServices++
                Write-Log "Service OK: $line" "INFO"
            } else {
                Write-Log "Service Issue: $line" "WARN"
            }
        }
        
        if ($runningServices -eq $totalServices -and $totalServices -gt 0) {
            Write-Log "All $totalServices Docker services are healthy" "SUCCESS"
            return $true
        } else {
            Write-Log "Only $runningServices/$totalServices services are running" "WARN"
            return $false
        }
    } catch {
        Write-Log "Docker service test failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-DatabaseOperations {
    Write-Log "Testing Database Operations..." "INFO"
    
    try {
        $testTable = "continuous_test_$(Get-Date -Format 'HHmmss')"
        $dbTest = docker compose exec -T db psql -U postgres -d vitrinealu -c "
            CREATE TABLE $testTable (id SERIAL PRIMARY KEY, test_data VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());
            INSERT INTO $testTable (test_data) VALUES ('Test at $(Get-Date)');
            SELECT COUNT(*) FROM $testTable;
            DROP TABLE $testTable;
        " 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Database operations successful" "SUCCESS"
            return $true
        } else {
            Write-Log "Database operations failed" "ERROR"
            return $false
        }
    } catch {
        Write-Log "Database test error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-CacheOperations {
    Write-Log "Testing Cache Operations..." "INFO"
    
    try {
        $testKey = "test_key_$(Get-Date -Format 'HHmmss')"
        $testValue = "test_value_$(Get-Date)"
        
        $cacheSet = docker compose exec -T cache redis-cli SET $testKey $testValue 2>$null
        $cacheGet = docker compose exec -T cache redis-cli GET $testKey 2>$null
        $cacheDel = docker compose exec -T cache redis-cli DEL $testKey 2>$null
        
        if ($cacheGet -match $testValue) {
            Write-Log "Cache operations successful" "SUCCESS"
            return $true
        } else {
            Write-Log "Cache operations failed" "ERROR"
            return $false
        }
    } catch {
        Write-Log "Cache test error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-N8nAccessibility {
    Write-Log "Testing n8n Accessibility..." "INFO"
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 30 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Log "n8n web interface accessible (HTTP $($response.StatusCode))" "SUCCESS"
            return $true
        } else {
            Write-Log "n8n returned HTTP $($response.StatusCode)" "WARN"
            return $false
        }
    } catch {
        Write-Log "n8n accessibility test failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-FileSystemOperations {
    Write-Log "Testing File System Operations..." "INFO"
    
    try {
        $testFile = "assets/ready/continuous_test_$(Get-Date -Format 'HHmmss').txt"
        $testContent = "Continuous test at $(Get-Date)"
        
        $testContent | Out-File -FilePath $testFile -Encoding UTF8
        
        if (Test-Path $testFile) {
            $readContent = Get-Content $testFile -Raw
            Remove-Item $testFile -Force
            
            if ($readContent.Trim() -eq $testContent) {
                Write-Log "File system operations successful" "SUCCESS"
                return $true
            } else {
                Write-Log "File content mismatch" "ERROR"
                return $false
            }
        } else {
            Write-Log "File creation failed" "ERROR"
            return $false
        }
    } catch {
        Write-Log "File system test error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-SystemResources {
    Write-Log "Testing System Resources..." "INFO"
    
    try {
        # Get Docker container resource usage
        $containers = docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Container resource usage:" "INFO"
            $containers -split "`n" | ForEach-Object {
                if ($_ -and $_ -notmatch "CONTAINER") {
                    Write-Log "  $_" "INFO"
                }
            }
            
            # Check disk space
            $diskInfo = Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3}
            foreach ($disk in $diskInfo) {
                $freeSpaceGB = [math]::Round($disk.FreeSpace / 1GB, 2)
                $totalSpaceGB = [math]::Round($disk.Size / 1GB, 2)
                $percentFree = [math]::Round(($disk.FreeSpace / $disk.Size) * 100, 1)
                
                Write-Log "Disk $($disk.DeviceID) - $freeSpaceGB GB free of $totalSpaceGB GB ($percentFree%)" "INFO"
                
                if ($percentFree -lt 10) {
                    Write-Log "Low disk space warning on $($disk.DeviceID)" "WARN"
                }
            }
            
            return $true
        } else {
            Write-Log "Resource monitoring failed" "ERROR"
            return $false
        }
    } catch {
        Write-Log "Resource test error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-ConfigurationFiles {
    Write-Log "Testing Configuration Files..." "INFO"
    
    try {
        $configFiles = @("config/brand.yaml", "config/schedule.yaml", "config/providers.yaml")
        $allValid = $true
        
        foreach ($file in $configFiles) {
            if (Test-Path $file) {
                try {
                    $content = Get-Content $file -Raw
                    if ($content.Length -gt 10) {
                        Write-Log "Config file OK: $file ($($content.Length) bytes)" "INFO"
                    } else {
                        Write-Log "Config file too small: $file" "WARN"
                        $allValid = $false
                    }
                } catch {
                    Write-Log "Config file read error: $file" "ERROR"
                    $allValid = $false
                }
            } else {
                Write-Log "Config file missing: $file" "ERROR"
                $allValid = $false
            }
        }
        
        if ($allValid) {
            Write-Log "All configuration files validated" "SUCCESS"
        }
        
        return $allValid
    } catch {
        Write-Log "Configuration test error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Run-ComprehensiveTest {
    param([int]$TestNum)
    
    Write-Log "========== COMPREHENSIVE TEST #$TestNum ==========" "INFO"
    $testResults = @{}
    
    $testResults["Docker Services"] = Test-DockerServices
    $testResults["Database Operations"] = Test-DatabaseOperations
    $testResults["Cache Operations"] = Test-CacheOperations
    $testResults["n8n Accessibility"] = Test-N8nAccessibility
    $testResults["File System"] = Test-FileSystemOperations
    $testResults["System Resources"] = Test-SystemResources
    $testResults["Configuration Files"] = Test-ConfigurationFiles
    
    # Calculate success rate
    $successCount = ($testResults.Values | Where-Object { $_ -eq $true }).Count
    $totalTests = $testResults.Count
    $successRate = [math]::Round(($successCount / $totalTests) * 100, 1)
    
    Write-Log "Test #$TestNum Results: $successCount/$totalTests passed ($successRate%)" "INFO"
    
    # Log individual results
    foreach ($test in $testResults.GetEnumerator()) {
        $status = if ($test.Value) { "PASS" } else { "FAIL" }
        $level = if ($test.Value) { "SUCCESS" } else { "ERROR" }
        Write-Log "  $($test.Key): $status" $level
    }
    
    Write-Log "========== TEST #$TestNum COMPLETE ==========" "INFO"
    Write-Log "" "INFO"
    
    return @{
        SuccessRate = $successRate
        Results = $testResults
    }
}

# Main testing loop
Write-Log "Starting continuous testing for $WorkdayHours hours..." "INFO"
Write-Log "Tests will run every $TestIntervalMinutes minutes" "INFO"
Write-Log "" "INFO"

$allTestResults = @()

while ((Get-Date) -lt $EndTime) {
    $currentTime = Get-Date
    Write-Host "[$($currentTime.ToString("HH:mm:ss"))] Running Test #$TestNumber..." -ForegroundColor Cyan
    
    $testResult = Run-ComprehensiveTest -TestNum $TestNumber
    $allTestResults += $testResult
    
    Write-Host "Test #$TestNumber completed. Success Rate: $($testResult.SuccessRate)%" -ForegroundColor $(if ($testResult.SuccessRate -ge 80) { "Green" } else { "Yellow" })
    
    $TestNumber++
    
    # Calculate time to next test
    $nextTestTime = $currentTime.AddMinutes($TestIntervalMinutes)
    
    if ($nextTestTime -lt $EndTime) {
        $waitMinutes = [math]::Max(1, $TestIntervalMinutes)
        Write-Host "Next test in $waitMinutes minutes at $($nextTestTime.ToString("HH:mm:ss"))..." -ForegroundColor Gray
        Start-Sleep -Seconds ($waitMinutes * 60)
    } else {
        Write-Log "Workday testing period complete" "INFO"
        break
    }
}

# Generate final summary
$finalTime = Get-Date
$actualDuration = $finalTime - $StartTime
$totalTests = $allTestResults.Count

Write-Log "========================================" "INFO"
Write-Log "CONTINUOUS TESTING SUMMARY" "INFO"
Write-Log "========================================" "INFO"
Write-Log "Start Time: $($StartTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
Write-Log "End Time: $($finalTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
Write-Log "Duration: $([math]::Round($actualDuration.TotalHours, 1)) hours" "INFO"
Write-Log "Total Tests Run: $totalTests" "INFO"

if ($totalTests -gt 0) {
    $avgSuccessRate = ($allTestResults | Measure-Object -Property SuccessRate -Average).Average
    Write-Log "Average Success Rate: $([math]::Round($avgSuccessRate, 1))%" "SUCCESS"
    
    # Find best and worst performing tests
    $bestTest = $allTestResults | Sort-Object SuccessRate -Descending | Select-Object -First 1
    $worstTest = $allTestResults | Sort-Object SuccessRate | Select-Object -First 1
    
    Write-Log "Best Test Performance: $($bestTest.SuccessRate)%" "INFO"
    Write-Log "Worst Test Performance: $($worstTest.SuccessRate)%" "INFO"
    
    if ($avgSuccessRate -ge 90) {
        Write-Log "OVERALL SYSTEM STATUS: EXCELLENT" "SUCCESS"
    } elseif ($avgSuccessRate -ge 75) {
        Write-Log "OVERALL SYSTEM STATUS: GOOD" "SUCCESS"
    } elseif ($avgSuccessRate -ge 50) {
        Write-Log "OVERALL SYSTEM STATUS: NEEDS ATTENTION" "WARN"
    } else {
        Write-Log "OVERALL SYSTEM STATUS: CRITICAL ISSUES DETECTED" "ERROR"
    }
}

Write-Log "========================================" "INFO"
Write-Log "Testing session complete. Review $LogFile for detailed results." "INFO"

Write-Host ""
Write-Host "🎉 Continuous testing completed!" -ForegroundColor Green
Write-Host "📊 Ran $totalTests comprehensive test cycles" -ForegroundColor Cyan
Write-Host "📝 Detailed results saved to: $LogFile" -ForegroundColor Yellow
Write-Host "⏱️  Total runtime: $([math]::Round($actualDuration.TotalHours, 1)) hours" -ForegroundColor Cyan