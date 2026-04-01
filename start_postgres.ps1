$pgBin = "C:\Program Files\PostgreSQL\14\bin"
$dataDir = "C:\Program Files\PostgreSQL\14\data"

Write-Output "Registering PostgreSQL service..."
& "$pgBin\pg_ctl.exe" register -N "postgresql-x64-14" -D $dataDir -U "NT AUTHORITY\NetworkService"

if ($LASTEXITCODE -eq 0) {
    Write-Output "Service registered successfully"

    Write-Output "Starting PostgreSQL service..."
    Start-Service -Name "postgresql-x64-14"

    Start-Sleep -Seconds 2

    $service = Get-Service -Name "postgresql-x64-14"
    Write-Output "Service Status:"
    $service | Select-Object Name, Status, DisplayName | Format-Table -AutoSize
} else {
    Write-Output "Failed to register service. Trying to start directly with pg_ctl..."
    & "$pgBin\pg_ctl.exe" start -D $dataDir -l "C:\Program Files\PostgreSQL\14\logfile.log"

    if ($LASTEXITCODE -eq 0) {
        Write-Output "PostgreSQL started successfully with pg_ctl"
    } else {
        Write-Output "Failed to start PostgreSQL"
    }
}
