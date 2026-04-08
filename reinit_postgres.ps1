$pgBin = "C:\Program Files\PostgreSQL\14\bin"
$dataDir = "C:\Program Files\PostgreSQL\14\data"
$password = "saivarma"
$pwdFile = "C:\Program Files\PostgreSQL\14\pgpass.txt"

Write-Output "Creating password file..."
Set-Content -Path $pwdFile -Value $password

Write-Output "Initializing PostgreSQL database cluster..."
$output = & "$pgBin\initdb.exe" -D $dataDir -U postgres -E UTF8 -A md5 --pwfile=$pwdFile 2>&1
Write-Output $output

# Remove password file
Remove-Item -Path $pwdFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Output "`nInitialization successful! Starting PostgreSQL..."

    # Start PostgreSQL
    $startOutput = & "$pgBin\pg_ctl.exe" start -D $dataDir -l "$dataDir\logfile.log" 2>&1
    Write-Output $startOutput

    Start-Sleep -Seconds 3

    # Check status
    $statusOutput = & "$pgBin\pg_ctl.exe" status -D $dataDir 2>&1
    Write-Output "`nPostgreSQL Status:"
    Write-Output $statusOutput
} else {
    Write-Output "`nInitialization failed with exit code: $LASTEXITCODE"
}
