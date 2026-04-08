$service = Get-Service | Where-Object {$_.DisplayName -like '*postgresql*14*'}
if ($service) {
    $service | Select-Object Name, Status, DisplayName
} else {
    Write-Output "No PostgreSQL service found"
}
