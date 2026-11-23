param(
  [switch]$SkipInstall,
  [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ is required. Install Node.js first, then rerun this script."
}

Set-Location $RootDir

$Args = @("scripts/source_install_check.js", "--platform=win")
if ($SkipInstall) {
  $Args += "--skip-install"
}
if ($SkipCheck) {
  $Args += "--skip-check"
}

& node @Args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
