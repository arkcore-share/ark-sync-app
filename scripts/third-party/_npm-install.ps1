param(
  [Parameter(Mandatory)][string]$Label,
  [Parameter(Mandatory)][string]$Package
)

# Continue: npm may write progress to stderr; Stop would abort the script early.
$ErrorActionPreference = 'Continue'

$nodejs = Join-Path ${env:ProgramFiles} 'nodejs'
$npmGlobal = Join-Path $env:APPDATA 'npm'
foreach ($dir in @($nodejs, $npmGlobal)) {
  if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) {
    $env:Path = "$dir;$env:Path"
  }
}

$npmCmd = Join-Path $nodejs 'npm.cmd'
if (-not (Test-Path $npmCmd)) {
  $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
}
if (-not $npmCmd) {
  Write-Host "[$Label] npm.cmd not found. Install Node.js from https://nodejs.org then restart this app."
  exit 1
}

Write-Host "[$Label] npm install -g $Package"
& $npmCmd install -g $Package
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 1 }
exit $code
