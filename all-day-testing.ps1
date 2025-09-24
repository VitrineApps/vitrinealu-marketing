#!/usr/bin/env pwsh
# VitrineAlu Marketing Automation - All-Day Testing Orchestrator
# Manages continuous testing, stress testing, and monitoring throughout your workday

param(
    [int]$WorkdayHours = 8,
    [int]$StressLevel = 2, # 1=Light, 2=Medium, 3=Heavy
    [switch]$EnableMonitoring,
    [switch]$EnableStressTesting,
    [switch]$EnableContinuousTesting,
    [switch]$All # Enable all testing modes
)

if ($All) {
    $EnableMonitoring = $true
    $EnableStressTesting = $true
    $EnableContinuousTesting = $true
}

$ErrorActionPreference = "Continue"
$StartTime = Get-Date
$EndTime = $StartTime.AddHours($WorkdayHours)

# Create main log file
$MainLogFile = "all-day-testing-$(Get-Date -Format 'yyyy-MM-dd').log"

function Write-MainLog {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [ORCHESTRATOR-$Level] $Message"
    $LogEntry | Out-File -FilePath $MainLogFile -Append -Encoding UTF8
    
    $Color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        "START" { "Cyan" }
        default { "White" }
    }
    
    Write-Host $LogEntry -ForegroundColor $Color
}

# Log startup configuration
$StartupLog = @"
========================================
VitrineAlu Marketing Automation
All-Day Testing Orchestrator Started
========================================
Date: $($StartTime.ToString("yyyy-MM-dd"))
Start Time: $($StartTime.ToString("HH:mm:ss"))
End Time: $($EndTime.ToString("HH:mm:ss"))
Duration: $WorkdayHours hours
========================================
Testing Configuration:
- Continuous Testing: $EnableContinuousTesting
- Stress Testing: $EnableStressTesting (Level $StressLevel)
- Live Monitoring: $EnableMonitoring
========================================

"@

$StartupLog | Out-File -FilePath $MainLogFile -Encoding UTF8
Write-Host $StartupLog -ForegroundColor Green

Write-MainLog "All-day testing orchestrator initialized" "START"

# Check prerequisites
Write-MainLog "Checking system prerequisites..." "INFO"

# Verify Docker is running
try {
    $dockerVersion = docker version --format "{{.Server.Version}}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not running"
    }
    Write-MainLog "Docker is running (version: $dockerVersion)" "SUCCESS"
} catch {
    Write-MainLog "CRITICAL: Docker is not running. Please start Docker Desktop first." "ERROR"
    exit 1
}

# Verify services are running
try {
    $services = docker compose ps --format "{{.Service}} {{.Status}}" 2>$null
    $runningServices = ($services | Where-Object { $_ -match "running|Up" }).Count
    $totalServices = $services.Count
    
    if ($runningServices -gt 0) {
        Write-MainLog "Docker services status: $runningServices/$totalServices running" "SUCCESS"
    } else {
        Write-MainLog "WARNING: No Docker services appear to be running" "WARN"
        Write-MainLog "Starting core services..." "INFO"
        docker compose up db cache n8n -d 2>&1 | Out-Host
        Start-Sleep -Seconds 10
    }
} catch {
    Write-MainLog "Error checking Docker services: $($_.Exception.Message)" "ERROR"
}

# Initialize job tracking
$RunningJobs = @{}

# Start continuous testing if enabled
if ($EnableContinuousTesting) {
    Write-MainLog "Starting continuous testing job..." "START"
    
    $ContinuousTestJob = Start-Job -ScriptBlock {
        param($WorkdayHours, $MainLogPath, $WorkingDir)
        
        Set-Location $WorkingDir
        & ".\continuous-testing.ps1" -WorkdayHours $WorkdayHours -TestIntervalMinutes 15 -Verbose
        
    } -ArgumentList $WorkdayHours, $MainLogFile, $PWD
    
    $RunningJobs["ContinuousTesting"] = $ContinuousTestJob
    Write-MainLog "Continuous testing job started (ID: $($ContinuousTestJob.Id))" "SUCCESS"
}

# Start stress testing if enabled
if ($EnableStressTesting) {
    Write-MainLog "Starting stress testing job..." "START"
    
    $StressTestJob = Start-Job -ScriptBlock {
        param($WorkdayHours, $StressLevel, $WorkingDir)
        
        Set-Location $WorkingDir
        & ".\stress-testing.ps1" -DurationHours $WorkdayHours -LoadLevel $StressLevel
        
    } -ArgumentList $WorkdayHours, $StressLevel, $PWD
    
    $RunningJobs["StressTesting"] = $StressTestJob
    Write-MainLog "Stress testing job started (ID: $($StressTestJob.Id)) - Level $StressLevel" "SUCCESS"
}

# Start monitoring dashboard if enabled
if ($EnableMonitoring) {
    Write-MainLog "Starting monitoring dashboard..." "START"
    
    $MonitoringJob = Start-Job -ScriptBlock {
        param($WorkdayHours, $WorkingDir)
        
        Set-Location $WorkingDir
        
        # Run monitoring for the workday duration
        $EndTime = (Get-Date).AddHours($WorkdayHours)
        
        try {
            while ((Get-Date) -lt $EndTime) {
                & ".\monitoring-dashboard.ps1" -RefreshSeconds 60 -SaveMetrics
                Start-Sleep -Seconds 60
            }
        } catch {
            # Monitoring stopped
        }
        
    } -ArgumentList $WorkdayHours, $PWD
    
    $RunningJobs["Monitoring"] = $MonitoringJob
    Write-MainLog "Monitoring dashboard job started (ID: $($MonitoringJob.Id))" "SUCCESS"
}

# Display what's running
Write-MainLog "========== ACTIVE TESTING JOBS ==========" "INFO"
foreach ($job in $RunningJobs.GetEnumerator()) {
    Write-MainLog "$($job.Key): Job ID $($job.Value.Id) - State: $($job.Value.State)" "INFO"
}
Write-MainLog "=========================================" "INFO"

if ($RunningJobs.Count -eq 0) {
    Write-MainLog "No testing jobs enabled. Use -All or enable specific testing modes." "WARN"
    Write-MainLog "Available options: -EnableContinuousTesting, -EnableStressTesting, -EnableMonitoring, -All" "INFO"
    exit 1
}

# Monitoring loop
Write-MainLog "Beginning workday monitoring for $WorkdayHours hours..." "INFO"
Write-MainLog "Press Ctrl+C to stop all testing jobs" "INFO"

$StatusCheckInterval = 300 # 5 minutes
$LastStatusCheck = Get-Date

try {
    while ((Get-Date) -lt $EndTime) {
        $CurrentTime = Get-Date
        
        # Check job status every 5 minutes
        if (($CurrentTime - $LastStatusCheck).TotalSeconds -ge $StatusCheckInterval) {
            Write-MainLog "========== JOB STATUS CHECK ==========" "INFO"
            
            $ActiveJobs = 0
            $CompletedJobs = 0
            $FailedJobs = 0
            
            foreach ($jobEntry in $RunningJobs.GetEnumerator()) {
                $job = $jobEntry.Value
                $jobName = $jobEntry.Key
                
                switch ($job.State) {
                    "Running" {
                        $ActiveJobs++
                        Write-MainLog "$jobName: Running (ID: $($job.Id))" "SUCCESS"
                    }
                    "Completed" {
                        $CompletedJobs++
                        Write-MainLog "$jobName: Completed (ID: $($job.Id))" "INFO"
                        # Get job results if available
                        try {
                            $results = Receive-Job -Job $job -Keep
                            if ($results) {
                                Write-MainLog "$jobName results: $($results.Count) output lines" "INFO"
                            }
                        } catch { }
                    }
                    "Failed" {
                        $FailedJobs++
                        Write-MainLog "$jobName: Failed (ID: $($job.Id))" "ERROR"
                        # Get error details
                        try {
                            $errors = Receive-Job -Job $job -Keep
                            Write-MainLog "$jobName error: $errors" "ERROR"
                        } catch { }
                    }
                    default {
                        Write-MainLog "$jobName: State $($job.State) (ID: $($job.Id))" "WARN"
                    }
                }
            }
            
            Write-MainLog "Job summary: $ActiveJobs active, $CompletedJobs completed, $FailedJobs failed" "INFO"
            Write-MainLog "Time remaining: $([math]::Round(($EndTime - $CurrentTime).TotalHours, 1)) hours" "INFO"
            Write-MainLog "=====================================" "INFO"
            
            $LastStatusCheck = $CurrentTime
        }
        
        # Brief status update every minute
        $TimeRemaining = $EndTime - $CurrentTime
        if ($TimeRemaining.TotalMinutes -gt 0) {
            $Status = "[$($CurrentTime.ToString("HH:mm:ss"))] Testing in progress - $([math]::Round($TimeRemaining.TotalHours, 1))h remaining"
            Write-Host $Status -ForegroundColor Gray
        }
        
        Start-Sleep -Seconds 60
    }
    
} catch [System.Management.Automation.PipelineStoppedException] {
    Write-MainLog "Testing interrupted by user" "WARN"
} catch {
    Write-MainLog "Monitoring error: $($_.Exception.Message)" "ERROR"
} finally {
    # Clean up all jobs
    Write-MainLog "========== CLEANUP & SHUTDOWN ==========" "INFO"
    
    foreach ($jobEntry in $RunningJobs.GetEnumerator()) {
        $job = $jobEntry.Value
        $jobName = $jobEntry.Key
        
        Write-MainLog "Stopping $jobName job (ID: $($job.Id))..." "INFO"
        
        try {
            if ($job.State -eq "Running") {
                Stop-Job -Job $job -PassThru | Out-Null
                Write-MainLog "$jobName job stopped" "INFO"
            }
            
            # Collect final results
            $results = Receive-Job -Job $job -ErrorAction SilentlyContinue
            if ($results) {
                Write-MainLog "$jobName final output: $($results.Count) lines collected" "INFO"
            }
            
            Remove-Job -Job $job -Force
            Write-MainLog "$jobName job cleaned up" "SUCCESS"
            
        } catch {
            Write-MainLog "Error cleaning up $jobName job: $($_.Exception.Message)" "ERROR"
        }
    }
    
    $FinalTime = Get-Date
    $ActualDuration = $FinalTime - $StartTime
    
    Write-MainLog "========================================" "INFO"
    Write-MainLog "ALL-DAY TESTING SESSION COMPLETE" "SUCCESS"
    Write-MainLog "========================================" "INFO"
    Write-MainLog "Start Time: $($StartTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
    Write-MainLog "End Time: $($FinalTime.ToString("yyyy-MM-dd HH:mm:ss"))" "INFO"
    Write-MainLog "Actual Duration: $([math]::Round($ActualDuration.TotalHours, 1)) hours" "INFO"
    Write-MainLog "Jobs Executed: $($RunningJobs.Count)" "INFO"
    Write-MainLog "========================================" "INFO"
    
    # Generate summary of log files
    $LogFiles = @()
    if (Test-Path "continuous-test-results.log") { $LogFiles += "continuous-test-results.log" }
    if (Test-Path "stress-test-results.log") { $LogFiles += "stress-test-results.log" }
    if (Test-Path "system-metrics-history.json") { $LogFiles += "system-metrics-history.json" }
    $LogFiles += $MainLogFile
    
    Write-MainLog "Generated log files:" "INFO"
    foreach ($logFile in $LogFiles) {
        if (Test-Path $logFile) {
            $size = [math]::Round((Get-Item $logFile).Length / 1KB, 1)
            Write-MainLog "  📄 $logFile ($size KB)" "INFO"
        }
    }
    
    Write-Host ""
    Write-Host "🎉 All-day testing session completed!" -ForegroundColor Green
    Write-Host "📊 Check the log files above for detailed results" -ForegroundColor Cyan
    Write-Host "🏆 Your VitrineAlu Marketing Automation system has been thoroughly tested!" -ForegroundColor Yellow
}

# Quick usage examples
Write-Host ""
Write-Host "📋 Quick Usage Examples:" -ForegroundColor Yellow
Write-Host "  Full testing:        .\all-day-testing.ps1 -All" -ForegroundColor Cyan
Write-Host "  Light stress only:   .\all-day-testing.ps1 -EnableStressTesting -StressLevel 1" -ForegroundColor Cyan
Write-Host "  Monitoring only:     .\all-day-testing.ps1 -EnableMonitoring" -ForegroundColor Cyan
Write-Host "  Custom duration:     .\all-day-testing.ps1 -All -WorkdayHours 10" -ForegroundColor Cyan