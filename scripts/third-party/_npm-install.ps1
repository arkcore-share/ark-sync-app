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
# Avoid app-level Electron mirror envs being interpreted by npm as unknown configs.
foreach ($k in @(
  'npm_config_electron_mirror',
  'npm_config_electron_builder_binaries_mirror',
  'electron_mirror',
  'electron_builder_binaries_mirror'
)) {
  Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue
}
$cacheDir = Join-Path $env:TEMP 'ark-sync-npm-cache'
if (-not (Test-Path $cacheDir)) {
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
}
$env:npm_config_cache = $cacheDir
& cmd.exe /d /c "`"$npmCmd`" install -g $Package --no-audit --no-fund 2>&1"
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 1 }
exit $code
