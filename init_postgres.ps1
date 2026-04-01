# Initialize PostgreSQL database cluster
$pgBin = "C:\Program Files\PostgreSQL\14\bin"
$dataDir = "C:\Program Files\PostgreSQL\14\data"
$password = "saivarma"
$pwdFile = "C:\Program Files\PostgreSQL\14\pgpass.txt"

# Create password file
Write-Output "Creating password file..."
Set-Content -Path $pwdFile -Value $password

Write-Output "Initializing PostgreSQL database cluster..."
& "$pgBin\initdb.exe" -D $dataDir -U postgres -E UTF8 --locale=en_US -A md5 --pwfile=$pwdFile

if ($LASTEXITCODE -eq 0) {
    Write-Output "Database cluster initialized successfully"

    # Remove password file for security
    Remove-Item -Path $pwdFile -Force -ErrorAction SilentlyContinue

    # Register PostgreSQL as a Windows service
    Write-Output "Registering PostgreSQL service..."
    & "$pgBin\pg_ctl.exe" register -N "postgresql-x64-14" -D $dataDir

    # Start the service
    Write-Output "Starting PostgreSQL service..."
    Start-Service -Name "postgresql-x64-14"

    Write-Output "PostgreSQL is now running!"
    Get-Service -Name "postgresql-x64-14" | Select-Object Name, Status, DisplayName
} else {
    Write-Output "Failed to initialize database cluster"
    # Remove password file even on failure
    Remove-Item -Path $pwdFile -Force -ErrorAction SilentlyContinue
}
