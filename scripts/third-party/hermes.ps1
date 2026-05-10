# Nous Research Hermes Agent — https://github.com/NousResearch/hermes-agent
# 先卸掉误装的 React Native Hermes（npm），再执行官方 install.ps1。
$ErrorActionPreference = 'Continue'
& (Join-Path $PSScriptRoot 'hermes-cleanup-npm-rn.ps1')

$installUrl = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1'
Write-Host "[hermes-agent] Official installer: $installUrl"
$pwsh = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$p = Start-Process -FilePath $pwsh -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command', "iex ((Invoke-WebRequest -UseBasicParsing -Uri '$installUrl').Content)"
) -Wait -PassThru -NoNewWindow
exit $p.ExitCode
