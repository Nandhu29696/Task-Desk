# Registers the two TaskDesk jobs in Windows Task Scheduler, on the machine that runs the live app.
#   TaskDesk daily job : 00:05 every day  (npm run daily)  closes old sessions, creates recurring tasks, renewal reminders
#   TaskDesk backup    : 23:30 every day  (npm run backup) pg_dump into backups\, keeps 14 days
# Run once in an elevated PowerShell from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\schedule-windows.ps1
# Remove with: Unregister-ScheduledTask -TaskName "TaskDesk daily job","TaskDesk backup" -Confirm:$false
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $root "logs") | Out-Null

function Add-Job($name, $script, $time) {
  $cmd = "/c cd /d `"$root`" && npm run $script >> logs\$script.log 2>&1"
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -Daily -At $time
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "TaskDesk: npm run $script" -Force | Out-Null
  Write-Host "Registered '$name' at $time"
}

Add-Job "TaskDesk daily job" "daily" "00:05"
Add-Job "TaskDesk backup" "backup" "23:30"
Write-Host "Logs go to $root\logs. Run a job now with: Start-ScheduledTask -TaskName 'TaskDesk daily job'"
