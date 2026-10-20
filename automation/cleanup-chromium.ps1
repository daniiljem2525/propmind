$qs = "Name='chrome.exe'"
Get-CimInstance Win32_Process -Filter $qs |
  Where-Object { $_.CommandLine -like "*profi-profile*" } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output ("killed " + $_.ProcessId)
  }
Write-Output "done"
