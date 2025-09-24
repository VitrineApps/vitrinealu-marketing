#!/usr/bin/env pwsh
# VitrineAlu Marketing Automation - Stress Testing Suite
# Applies realistic load to test system stability

param(
    [int]$DurationHours = 8,
    [int]$LoadLevel = 2, # 1=Light, 2=Medium, 3=Heavy
    [string]$LogFile = "stress-test-results.log"
)

$ErrorActionPreference = "Continue"
$StartTime = Get-Date
$EndTime = $StartTime.AddHours($DurationHours)
$StressTestNumber = 1

# Load configuration based on level
$LoadConfig = switch ($LoadLevel) {
    1 { @{ # Light Load
        DatabaseOpsPerMinute = 10
        CacheOpsPerMinute = 20
        FileOpsPerMinute = 5
        HttpRequestsPerMinute = 15
        ConcurrentWorkers = 2
    }}
    2 { @{ # Medium Load  
        DatabaseOpsPerMinute = 25
        CacheOpsPerMinute = 50
        FileOpsPerMinute = 12
        HttpRequestsPerMinute = 30
        ConcurrentWorkers = 4
    }}
    3 { @{ # Heavy Load
        DatabaseOpsPerMinute = 50
        CacheOpsPerMinute = 100
        FileOpsPerMinute = 25
        HttpRequestsPerMinute = 60
        ConcurrentWorkers = 8
    }}
}

$LoadLevelName = @{1="Light"; 2="Medium"; 3="Heavy"}[$LoadLevel]

function Write-StressLog {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [STRESS-$Level] $Message"
    $LogEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    
    $Color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        "PERF" { "Cyan" }
        default { "White" }
    }
    
    Write-Host $LogEntry -ForegroundColor $Color
}

function Start-DatabaseStressTest {
    param([int]$Operations, [int]$Workers)
    
    $jobs = @()
    $opsPerWorker = [math]::Ceiling($Operations / $Workers)
    
    for ($w = 1; $w -le $Workers; $w++) {
        $job = Start-Job -ScriptBlock {
            param($WorkerId, $Operations, $LogFile)
            
            function Write-WorkerLog {
                param([string]$Message)
                $Timestamp = Get-Date -Format "HH:mm:ss"
                "[$Timestamp] [DB-Worker-$WorkerId] $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
            }
            
            $successCount = 0
            $errorCount = 0
            
            for ($i = 1; $i -le $Operations; $i++) {
                try {
                    $testTable = "stress_test_w${WorkerId}_$(Get-Date -Format 'HHmmss')_$i"
                    $result = docker compose exec -T db psql -U postgres -d vitrinealu -c "
                        CREATE TABLE $testTable (id SERIAL PRIMARY KEY, data TEXT, created_at TIMESTAMP DEFAULT NOW());
                        INSERT INTO $testTable (data) VALUES ('Stress test data $i from worker $WorkerId');
                        SELECT COUNT(*) FROM $testTable;
                        UPDATE $testTable SET data = 'Updated data $i';
                        DELETE FROM $testTable WHERE id = 1;
                        DROP TABLE $testTable;
                    " 2>`$null
                    
                    if ($LASTEXITCODE -eq 0) {
                        $successCount++
                    } else {
                        $errorCount++
                    }
                } catch {
                    $errorCount++
                }
                
                Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 500)
            }
            
            Write-WorkerLog "Completed: $successCount successful, $errorCount errors"
            return @{ Success = $successCount; Errors = $errorCount }
            
        } -ArgumentList $w, $opsPerWorker, $LogFile
        
        $jobs += $job
    }
    
    # Wait for all jobs to complete
    $results = $jobs | Wait-Job | Receive-Job
    $jobs | Remove-Job
    
    $totalSuccess = ($results | Measure-Object -Property Success -Sum).Sum
    $totalErrors = ($results | Measure-Object -Property Errors -Sum).Sum
    
    return @{
        TotalOperations = $totalSuccess + $totalErrors
        SuccessfulOperations = $totalSuccess
        ErrorOperations = $totalErrors
        SuccessRate = if (($totalSuccess + $totalErrors) -gt 0) { [math]::Round(($totalSuccess / ($totalSuccess + $totalErrors)) * 100, 1) } else { 0 }
    }
}

function Start-CacheStressTest {
    param([int]$Operations, [int]$Workers)
    
    $jobs = @()
    $opsPerWorker = [math]::Ceiling($Operations / $Workers)
    
    for ($w = 1; $w -le $Workers; $w++) {
        $job = Start-Job -ScriptBlock {
            param($WorkerId, $Operations)
            
            $successCount = 0
            $errorCount = 0
            
            for ($i = 1; $i -le $Operations; $i++) {
                try {
                    $key = "stress_key_w${WorkerId}_$i"
                    $value = "stress_value_$(Get-Date -Format 'HHmmssfff')_$i"
                    
                    # SET operation
                    $setResult = docker compose exec -T cache redis-cli SET $key $value 2>`$null
                    
                    # GET operation
                    $getValue = docker compose exec -T cache redis-cli GET $key 2>`$null
                    
                    # DEL operation
                    $delResult = docker compose exec -T cache redis-cli DEL $key 2>`$null
                    
                    if ($getValue -match $value) {
                        $successCount++
                    } else {
                        $errorCount++
                    }
                } catch {
                    $errorCount++
                }
                
                Start-Sleep -Milliseconds (Get-Random -Minimum 50 -Maximum 200)
            }
            
            return @{ Success = $successCount; Errors = $errorCount }
            
        } -ArgumentList $w, $opsPerWorker
        
        $jobs += $job
    }
    
    $results = $jobs | Wait-Job | Receive-Job  
    $jobs | Remove-Job
    
    $totalSuccess = ($results | Measure-Object -Property Success -Sum).Sum
    $totalErrors = ($results | Measure-Object -Property Errors -Sum).Sum
    
    return @{
        TotalOperations = $totalSuccess + $totalErrors
        SuccessfulOperations = $totalSuccess
        ErrorOperations = $totalErrors
        SuccessRate = if (($totalSuccess + $totalErrors) -gt 0) { [math]::Round(($totalSuccess / ($totalSuccess + $totalErrors)) * 100, 1) } else { 0 }
    }
}

function Start-FileSystemStressTest {
    param([int]$Operations, [int]$Workers)
    
    $jobs = @()
    $opsPerWorker = [math]::Ceiling($Operations / $Workers)
    
    for ($w = 1; $w -le $Workers; $w++) {
        $job = Start-Job -ScriptBlock {
            param($WorkerId, $Operations)
            
            $successCount = 0
            $errorCount = 0
            
            for ($i = 1; $i -le $Operations; $i++) {
                try {
                    $fileName = "assets/ready/stress_test_w${WorkerId}_$(Get-Date -Format 'HHmmssfff')_$i.txt"
                    $content = "Stress test file content from worker $WorkerId operation $i at $(Get-Date)"
                    
                    # Write file
                    $content | Out-File -FilePath $fileName -Encoding UTF8
                    
                    # Read file
                    $readContent = Get-Content $fileName -Raw
                    
                    # Verify content
                    if ($readContent.Trim() -eq $content) {
                        $successCount++
                    } else {
                        $errorCount++
                    }
                    
                    # Delete file
                    Remove-Item $fileName -Force -ErrorAction SilentlyContinue
                    
                } catch {
                    $errorCount++
                }
                
                Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 800)
            }
            
            return @{ Success = $successCount; Errors = $errorCount }
            
        } -ArgumentList $w, $opsPerWorker
        
        $jobs += $job
    }
    
    $results = $jobs | Wait-Job | Receive-Job
    $jobs | Remove-Job
    
    $totalSuccess = ($results | Measure-Object -Property Success -Sum).Sum
    $totalErrors = ($results | Measure-Object -Property Errors -Sum).Sum
    
    return @{
        TotalOperations = $totalSuccess + $totalErrors
        SuccessfulOperations = $totalSuccess
        ErrorOperations = $totalErrors
        SuccessRate = if (($totalSuccess + $totalErrors) -gt 0) { [math]::Round(($totalSuccess / ($totalSuccess + $totalErrors)) * 100, 1) } else { 0 }
    }
}

function Start-HttpStressTest {
    param([int]$Requests, [int]$Workers)
    
    $jobs = @()
    $reqsPerWorker = [math]::Ceiling($Requests / $Workers)
    
    for ($w = 1; $w -le $Workers; $w++) {
        $job = Start-Job -ScriptBlock {
            param($WorkerId, $Requests)
            
            $successCount = 0
            $errorCount = 0
            $totalResponseTime = 0
            
            for ($i = 1; $i -le $Requests; $i++) {
                try {
                    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
                    $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 10 -UseBasicParsing
                    $stopwatch.Stop()
                    
                    $totalResponseTime += $stopwatch.ElapsedMilliseconds
                    
                    if ($response.StatusCode -eq 200) {
                        $successCount++
                    } else {
                        $errorCount++
                    }
                } catch {
                    $errorCount++
                }
                
                Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 300)
            }
            
            $avgResponseTime = if ($successCount -gt 0) { [math]::Round($totalResponseTime / $successCount, 1) } else { 0 }
            
            return @{ 
                Success = $successCount
                Errors = $errorCount
                AvgResponseTime = $avgResponseTime
            }
            
        } -ArgumentList $w, $reqsPerWorker
        
        $jobs += $job
    }
    
    $results = $jobs | Wait-Job | Receive-Job
    $jobs | Remove-Job
    
    $totalSuccess = ($results | Measure-Object -Property Success -Sum).Sum
    $totalErrors = ($results | Measure-Object -Property Errors -Sum).Sum
    $avgResponseTime = if ($results.Count -gt 0) { ($results | Measure-Object -Property AvgResponseTime -Average).Average } else { 0 }
    
    return @{
        TotalRequests = $totalSuccess + $totalErrors
        SuccessfulRequests = $totalSuccess
        ErrorRequests = $totalErrors
        SuccessRate = if (($totalSuccess + $totalErrors) -gt 0) { [math]::Round(($totalSuccess / ($totalSuccess + $totalErrors)) * 100, 1) } else { 0 }
        AverageResponseTime = [math]::Round($avgResponseTime, 1)
    }
}

function Run-StressTestCycle {
    param([int]$CycleNumber)
    
    Write-StressLog "========== STRESS TEST CYCLE #$CycleNumber ==========" "INFO"
    Write-StressLog "Load Level: $LoadLevelName" "INFO"
    Write-StressLog "Workers: $($LoadConfig.ConcurrentWorkers)" "INFO"
    
    $cycleStartTime = Get-Date
    $results = @{}
    
    # Database stress test
    Write-StressLog "Starting Database stress test..." "INFO"
    $dbStart = Get-Date
    $results["Database"] = Start-DatabaseStressTest -Operations $LoadConfig.DatabaseOpsPerMinute -Workers $LoadConfig.ConcurrentWorkers
    $dbDuration = ((Get-Date) - $dbStart).TotalSeconds
    Write-StressLog "Database test completed in $([math]::Round($dbDuration, 1))s - $($results.Database.SuccessfulOperations)/$($results.Database.TotalOperations) ops succeeded ($($results.Database.SuccessRate)%)" "PERF"
    
    # Cache stress test
    Write-StressLog "Starting Cache stress test..." "INFO"
    $cacheStart = Get-Date
    $results["Cache"] = Start-CacheStressTest -Operations $LoadConfig.CacheOpsPerMinute -Workers $LoadConfig.ConcurrentWorkers
    $cacheDuration = ((Get-Date) - $cacheStart).TotalSeconds
    Write-StressLog "Cache test completed in $([math]::Round($cacheDuration, 1))s - $($results.Cache.SuccessfulOperations)/$($results.Cache.TotalOperations) ops succeeded ($($results.Cache.SuccessRate)%)" "PERF"
    
    # File system stress test
    Write-StressLog "Starting File System stress test..." "INFO"
    $fsStart = Get-Date
    $results["FileSystem"] = Start-FileSystemStressTest -Operations $LoadConfig.FileOpsPerMinute -Workers $LoadConfig.ConcurrentWorkers
    $fsDuration = ((Get-Date) - $fsStart).TotalSeconds
    Write-StressLog "File System test completed in $([math]::Round($fsDuration, 1))s - $($results.FileSystem.SuccessfulOperations)/$($results.FileSystem.TotalOperations) ops succeeded ($($results.FileSystem.SuccessRate)%)" "PERF"
    
    # HTTP stress test
    Write-StressLog "Starting HTTP stress test..." "INFO"
    $httpStart = Get-Date
    $results["HTTP"] = Start-HttpStressTest -Requests $LoadConfig.HttpRequestsPerMinute -Workers $LoadConfig.ConcurrentWorkers
    $httpDuration = ((Get-Date) - $httpStart).TotalSeconds
    Write-StressLog "HTTP test completed in $([math]::Round($httpDuration, 1))s - $($results.HTTP.SuccessfulRequests)/$($results.HTTP.TotalRequests) requests succeeded ($($results.HTTP.SuccessRate)%) - Avg response: $($results.HTTP.AverageResponseTime)ms" "PERF"
    
    $cycleDuration = ((Get-Date) - $cycleStartTime).TotalSeconds
    
    # Calculate overall performance
    $overallSuccessRate = ($results.Values | Measure-Object -Property SuccessRate -Average).Average
    
    Write-StressLog "Cycle #$CycleNumber completed in $([math]::Round($cycleDuration, 1))s - Overall success rate: $([math]::Round($overallSuccessRate, 1))%" "SUCCESS"
    Write-StressLog "========== CYCLE #$CycleNumber COMPLETE ==========" "INFO"
    Write-StressLog "" "INFO"
    
    return @{
        CycleNumber = $CycleNumber
        Duration = $cycleDuration
        OverallSuccessRate = $overallSuccessRate
        Results = $results
    }
}

# Initialize stress testing
$LogHeader = @"
========================================
VitrineAlu Marketing Automation
Stress Testing Session Started
========================================
Start Time: $($StartTime.ToString("yyyy-MM-dd HH:mm:ss"))
End Time: $($EndTime.ToString("yyyy-MM-dd HH:mm:ss"))
Duration: $DurationHours hours
Load Level: $LoadLevelName (Level $LoadLevel)
Concurrent Workers: $($LoadConfig.ConcurrentWorkers)
Operations per minute:
  - Database: $($LoadConfig.DatabaseOpsPerMinute)
  - Cache: $($LoadConfig.CacheOpsPerMinute)
  - File System: $($LoadConfig.FileOpsPerMinute)
  - HTTP: $($LoadConfig.HttpRequestsPerMinute)
========================================

"@

$LogHeader | Out-File -FilePath $LogFile -Encoding UTF8
Write-Host $LogHeader -ForegroundColor Green

$allResults = @()

# Main stress testing loop
Write-StressLog "Starting $LoadLevelName stress testing for $DurationHours hours..." "INFO"

while ((Get-Date) -lt $EndTime) {
    $result = Run-StressTestCycle -CycleNumber $StressTestNumber
    $allResults += $result
    
    $StressTestNumber++
    
    # Wait between cycles (1-2 minutes)
    $waitSeconds = Get-Random -Minimum 60 -Maximum 120
    Write-StressLog "Waiting $waitSeconds seconds before next cycle..." "INFO"
    Start-Sleep -Seconds $waitSeconds
}

# Generate final summary
$finalTime = Get-Date
$actualDuration = $finalTime - $StartTime
$totalCycles = $allResults.Count

Write-StressLog "========================================" "INFO"
Write-StressLog "STRESS TESTING SUMMARY" "INFO"  
Write-StressLog "========================================" "INFO"
Write-StressLog "Start Time: $($StartTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
Write-StressLog "End Time: $($finalTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
Write-StressLog "Duration: $([math]::Round($actualDuration.TotalHours, 1)) hours" "INFO"
Write-StressLog "Total Cycles: $totalCycles" "INFO"
Write-StressLog "Load Level: $LoadLevelName" "INFO"

if ($totalCycles -gt 0) {
    $avgSuccessRate = ($allResults | Measure-Object -Property OverallSuccessRate -Average).Average
    $avgCycleDuration = ($allResults | Measure-Object -Property Duration -Average).Average
    
    Write-StressLog "Average Success Rate: $([math]::Round($avgSuccessRate, 1))%" "SUCCESS"
    Write-StressLog "Average Cycle Duration: $([math]::Round($avgCycleDuration, 1)) seconds" "PERF"
    
    # System stability assessment
    if ($avgSuccessRate -ge 95) {
        Write-StressLog "SYSTEM STABILITY: EXCELLENT - System handled $LoadLevelName load very well" "SUCCESS"
    } elseif ($avgSuccessRate -ge 85) {
        Write-StressLog "SYSTEM STABILITY: GOOD - System performed well under $LoadLevelName load" "SUCCESS"
    } elseif ($avgSuccessRate -ge 70) {
        Write-StressLog "SYSTEM STABILITY: ACCEPTABLE - Some issues under $LoadLevelName load" "WARN"
    } else {
        Write-StressLog "SYSTEM STABILITY: NEEDS IMPROVEMENT - Significant issues under $LoadLevelName load" "ERROR"
    }
}

Write-StressLog "========================================" "INFO"

Write-Host ""
Write-Host "🏋️ Stress testing completed!" -ForegroundColor Green
Write-Host "🔥 Ran $totalCycles stress test cycles" -ForegroundColor Cyan
Write-Host "📊 Load Level: $LoadLevelName" -ForegroundColor Yellow
Write-Host "⏱️  Total runtime: $([math]::Round($actualDuration.TotalHours, 1)) hours" -ForegroundColor Cyan
Write-Host "📝 Detailed results saved to: $LogFile" -ForegroundColor Yellow