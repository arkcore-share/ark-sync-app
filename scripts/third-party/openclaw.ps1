# Ark Sync：尝试通过 npm 全局安装 OpenClaw（若包名或源不可用可能失败）
$ErrorActionPreference = 'Stop'
Write-Host "[openclaw] npm install -g openclaw"
npm install -g openclaw
exit $LASTEXITCODE
