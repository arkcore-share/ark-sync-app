# 仅卸载误装的 React Native Hermes（npm: hermes-engine-cli / hermes-engine）及指向它的 .cmd shim。
# 不删除 Nous Hermes Agent（%LOCALAPPDATA%\hermes、官方安装器）。
$ErrorActionPreference = 'Continue'
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($machinePath -and $userPath) {
  $env:Path = "$machinePath;$userPath;$env:Path"
} elseif ($userPath) {
  $env:Path = "$userPath;$env:Path"
}

$npm = $null
foreach ($name in @('npm.cmd', 'npm')) {
  try {
    $c = Get-Command $name -ErrorAction Stop
    if ($c) { $npm = $c.Source; break }
  } catch { }
}

if (-not $npm) {
  Write-Host '[hermes-cleanup] npm not found, nothing to remove from npm global.'
} else {
  Write-Host '[hermes-cleanup] npm uninstall -g hermes-engine-cli hermes-engine'
  & $npm uninstall -g hermes-engine-cli 2>$null
  & $npm uninstall -g hermes-engine 2>$null

  $prefix = (& $npm config get prefix 2>$null).Trim()
  if ($prefix) {
    foreach ($shim in @('hermes.cmd', 'hermesc.cmd')) {
      $shimPath = Join-Path $prefix $shim
      if (-not (Test-Path -LiteralPath $shimPath)) { continue }
      try {
        $raw = Get-Content -LiteralPath $shimPath -Raw -ErrorAction Stop
        if ($raw -match 'hermes-engine-cli') {
          Write-Host "[hermes-cleanup] Remove shim: $shimPath"
          Remove-Item -LiteralPath $shimPath -Force
        }
      } catch { }
    }
  }
}

Write-Host '[hermes-cleanup] Done (Nous Hermes Agent under LOCALAPPDATA\hermes is untouched).'
