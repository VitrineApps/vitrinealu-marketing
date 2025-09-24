param(
    [int]$WorkdayHours = 8,
    [switch]$EnableContinuousTesting,
    [switch]$EnableStressTesting,
    [switch]$EnableMonitoring,
    [switch]$All,
    [ValidateSet("Light", "Medium", "Heavy")]
    [string]$StressLevel = "Light"
)

# If -All is specified, enable all testing modes
if ($All) {
    $EnableContinuousTesting = $true
    $EnableStressTesting = $true
    $EnableMonitoring = $true
}

# If no specific tests are enabled, default to continuous testing
if (-not $EnableContinuousTesting -and -not $EnableStressTesting -and -not $EnableMonitoring) {
    $EnableContinuousTesting = $true
    $EnableMonitoring = $true
}

# Global variables
$script:StartTime = Get-Date
$script:EndTime = $script:StartTime.AddHours($WorkdayHours)
$script:LogFile = "all-day-testing-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Write-MainLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [$Level] $Message"
    
    # Color coding for console output
    switch ($Level) {
        "SUCCESS" { Write-Host $LogEntry -ForegroundColor Green }
        "ERROR" { Write-Host $LogEntry -ForegroundColor Red }
        "WARN" { Write-Host $LogEntry -ForegroundColor Yellow }
        "START" { Write-Host $LogEntry -ForegroundColor Cyan }
        default { Write-Host $LogEntry -ForegroundColor White }
    }
    
    # Also write to log file
    Add-Content -Path $script:LogFile -Value $LogEntry
}

# Display startup banner
Write-MainLog "=== VitrineAlu Marketing Automation - All-Day Testing Suite ===" "START"
Write-MainLog "Session Configuration:" "INFO"
Write-MainLog "Date: $($script:StartTime.ToString('yyyy-MM-dd'))" "INFO"
Write-MainLog "Start Time: $($script:StartTime.ToString('HH:mm:ss'))" "INFO"
Write-MainLog "End Time: $($script:EndTime.ToString('HH:mm:ss'))" "INFO"
Write-MainLog "Duration: $WorkdayHours hours" "INFO"
Write-MainLog "Testing Configuration:" "INFO"
Write-MainLog "- Continuous Testing: $EnableContinuousTesting" "INFO"
Write-MainLog "- Stress Testing: $EnableStressTesting (Level $StressLevel)" "INFO"
Write-MainLog "- Live Monitoring: $EnableMonitoring" "INFO"

# Pre-flight checks
Write-MainLog "Performing pre-flight system checks..." "START"

# Check Docker
try {
    $dockerVersion = docker --version 2>$null
    if ($dockerVersion) {
        Write-MainLog "Docker is running (version: $dockerVersion)" "SUCCESS"
    } else {
        Write-MainLog "CRITICAL: Docker is not running. Please start Docker Desktop first." "ERROR"
        exit 1
    }
} catch {
    Write-MainLog "CRITICAL: Docker is not available. Please install Docker Desktop." "ERROR"
    exit 1
}

# Check Docker services
try {
    $services = docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null
    if ($services) {
        $runningServices = ($services | Measure-Object).Count - 1  # Subtract header row
        $totalServices = ($services | Measure-Object).Count - 1
        Write-MainLog "Docker services status: $runningServices/$totalServices running" "SUCCESS"
    } else {
        Write-MainLog "WARNING: No Docker services appear to be running" "WARN"
    }
} catch {
    Write-MainLog "Error checking Docker services: $($_.Exception.Message)" "ERROR"
}

Write-MainLog "Pre-flight checks completed" "SUCCESS"

# Job tracking
$RunningJobs = @{}

# Start continuous testing if enabled
if ($EnableContinuousTesting) {
    Write-MainLog "Starting continuous testing..." "START"
    
    $ContinuousTestJob = Start-Job -ScriptBlock {
        param($WorkdayHours, $WorkingDir)
        
        Set-Location $WorkingDir
        & ".\continuous-testing.ps1" -DurationHours $WorkdayHours
        
    } -ArgumentList $WorkdayHours, $PWD
    
    $RunningJobs["ContinuousTesting"] = $ContinuousTestJob
    Write-MainLog "Continuous testing job started (ID: $($ContinuousTestJob.Id))" "SUCCESS"
}

# Start stress testing if enabled
if ($EnableStressTesting) {
    Write-MainLog "Starting stress testing..." "START"
    
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

# Display active jobs
Write-MainLog "Active test jobs:" "INFO"
foreach ($job in $RunningJobs.GetEnumerator()) {
    $jobKey = $job.Key
    $jobValue = $job.Value
    $jobId = $jobValue.Id
    $jobState = $jobValue.State
    Write-MainLog "Job $jobKey - ID $jobId - State $jobState" "INFO"
}

if ($RunningJobs.Count -eq 0) {
    Write-MainLog "No testing jobs were started. Please specify testing options:" "WARN"
    Write-MainLog "Available options: -EnableContinuousTesting, -EnableStressTesting, -EnableMonitoring, -All" "INFO"
    exit 0
}

Write-MainLog "All-day testing suite is now running..." "START"
Write-MainLog "Monitoring jobs every 5 minutes. Press Ctrl+C to stop early." "INFO"

# Main monitoring loop
try {
    while ((Get-Date) -lt $script:EndTime) {
        Start-Sleep -Seconds 300  # Check every 5 minutes
        
        $CurrentTime = Get-Date
        $ActiveJobs = 0
        $CompletedJobs = 0
        $FailedJobs = 0
        
        Write-MainLog "=== Job Status Check ===" "INFO"
        
        if ($RunningJobs.Count -gt 0) {
            foreach ($jobEntry in $RunningJobs.GetEnumerator()) {
                $job = $jobEntry.Value
                $jobName = $jobEntry.Key
                
                switch ($job.State) {
                    "Running" {
                        $ActiveJobs++
                        Write-MainLog "Job $jobName is Running with ID $($job.Id)" "SUCCESS"
                    }
                    "Completed" {
                        $CompletedJobs++
                        Write-MainLog "Job $jobName is Completed with ID $($job.Id)" "INFO"
                        # Get job results if available
                        try {
                            $results = Receive-Job -Job $job -Keep
                            if ($results) {
                                Write-MainLog "Job $jobName results has $($results.Count) output lines" "INFO"
                            }
                        } catch { }
                    }
                    "Failed" {
                        $FailedJobs++
                        Write-MainLog "Job $jobName has Failed with ID $($job.Id)" "ERROR"
                        try {
                            $errors = Receive-Job -Job $job -Keep
                            if ($errors) {
                                Write-MainLog "Job $jobName error is $errors" "ERROR"
                            }
                        } catch { }
                    }
                    default {
                        Write-MainLog "Job $jobName has State $($job.State) with ID $($job.Id)" "WARN"
                    }
                }
            }
            
            Write-MainLog "Job summary: $ActiveJobs active, $CompletedJobs completed, $FailedJobs failed" "INFO"
            $TimeRemaining = ($script:EndTime - $CurrentTime).TotalHours
            $TimeRemainingRounded = [math]::Round($TimeRemaining, 1)
            Write-MainLog "Time remaining: $TimeRemainingRounded hours" "INFO"
        }
        
        # Update console title with progress
        try {
            $TimeRemaining = $script:EndTime - $CurrentTime
            $TimeRemainingRounded = [math]::Round($TimeRemaining.TotalHours, 1)
            $CurrentTimeStr = $CurrentTime.ToString('HH:mm:ss')
            $Status = "[$CurrentTimeStr] Testing in progress - ${TimeRemainingRounded}h remaining"
            $Host.UI.RawUI.WindowTitle = $Status
        } catch {
            # Title update failed, continue anyway
        }
    }
} catch [System.Management.Automation.PipelineStoppedException] {
    Write-MainLog "Testing interrupted by user (Ctrl+C)" "WARN"
} catch {
    Write-MainLog "Monitoring error: $($_.Exception.Message)" "ERROR"
}

# Cleanup phase
Write-MainLog "=== Cleanup Phase ===" "START"

foreach ($jobEntry in $RunningJobs.GetEnumerator()) {
    $job = $jobEntry.Value
    $jobName = $jobEntry.Key
    
    try {
        Write-MainLog "Stopping job $jobName with ID $($job.Id)" "INFO"
        
        # Stop the job gracefully
        Stop-Job -Job $job -PassThru | Out-Null
        
        # Wait a moment for cleanup
        Start-Sleep -Seconds 2
        
        # Collect final output
        try {
            $results = Receive-Job -Job $job
            if ($results) {
                Write-MainLog "Job $jobName final output has $($results.Count) lines collected" "INFO"
            }
        } catch { }
        
        # Remove the job
        Remove-Job -Job $job -Force
        Write-MainLog "Job $jobName cleaned up successfully" "SUCCESS"
        
    } catch {
        Write-MainLog "Error cleaning up job $jobName with error $($_.Exception.Message)" "ERROR"
    }
}

# Final summary
$FinalTime = Get-Date
$ActualDuration = $FinalTime - $script:StartTime

Write-MainLog "=== All-Day Testing Complete ===" "SUCCESS"
$StartTimeStr = $script:StartTime.ToString('yyyy-MM-dd HH:mm:ss')
$FinalTimeStr = $FinalTime.ToString('yyyy-MM-dd HH:mm:ss')
$ActualDurationRounded = [math]::Round($ActualDuration.TotalHours, 1)

Write-MainLog "Start Time: $StartTimeStr" "INFO"
Write-MainLog "End Time: $FinalTimeStr" "INFO"
Write-MainLog "Actual Duration: $ActualDurationRounded hours" "INFO"
Write-MainLog "Log File: $script:LogFile" "INFO"
Write-MainLog "Thank you for using the VitrineAlu Marketing Automation Testing Suite!" "SUCCESS"

# Reset console title
try {
    $Host.UI.RawUI.WindowTitle = "PowerShell"
} catch { }