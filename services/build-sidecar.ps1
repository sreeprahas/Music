$ErrorActionPreference = 'Stop'
$python = if ($env:YTMUSIC_PYTHON) { $env:YTMUSIC_PYTHON } else { 'python' }
& $python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt') pyinstaller
& $python -m PyInstaller --onefile --name ytmusic-sidecar --collect-all ytmusicapi --distpath $PSScriptRoot --workpath (Join-Path $PSScriptRoot '.build') --specpath (Join-Path $PSScriptRoot '.build') (Join-Path $PSScriptRoot 'ytmusic_service.py')
