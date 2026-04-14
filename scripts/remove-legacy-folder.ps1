# Удаляет пустую папку jesus-world-3d, если она осталась после слияния (часто блокируется IDE).
# Закройте Cursor для этой папки или выполните из другого каталога:
#   powershell -ExecutionPolicy Bypass -File "C:\path\to\jesusGAME\scripts\remove-legacy-folder.ps1"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$legacy = Join-Path $root "jesus-world-3d"
if (-not (Test-Path -LiteralPath $legacy)) {
  Write-Host "jesus-world-3d не найдена — ок."
  exit 0
}
Remove-Item -LiteralPath $legacy -Force -Recurse
Write-Host "Удалено: $legacy"
