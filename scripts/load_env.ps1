param(
  [string]$EnvFile = ".env.local"
)
if (!(Test-Path $EnvFile)) {
  Write-Host "Missing $EnvFile. Copy .env.local.example -> .env.local and fill secrets." -ForegroundColor Yellow
  exit 1
}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $parts = $line.Split("=", 2)
  if ($parts.Length -ne 2) { return }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ($name -ne "") {
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}
Write-Host "Loaded env from $EnvFile" -ForegroundColor Green
