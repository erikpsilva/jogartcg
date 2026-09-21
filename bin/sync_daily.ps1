$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$phpBinary = 'C:\xampp\php\php.exe'

if (-not (Test-Path -LiteralPath $phpBinary)) {
    throw "PHP não encontrado em $phpBinary"
}

& $phpBinary (Join-Path $PSScriptRoot 'sync_lorcana.php')
if ($LASTEXITCODE -ne 0) {
    throw 'A sincronização do catálogo falhou.'
}

$translationVendor = Join-Path $projectRoot '.tools\python'
$translationModel = Join-Path $projectRoot '.tools\models\translate-en_pt-1_9\model'
if (-not (Test-Path -LiteralPath $translationVendor) -or -not (Test-Path -LiteralPath $translationModel)) {
    Write-Output 'Tradutor local não instalado; os novos registros permanecerão pendentes.'
    exit 0
}

$pythonBinary = $env:LORCANA_PYTHON_BIN
if (-not $pythonBinary) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand -and $pythonCommand.Source -notlike '*WindowsApps*') {
        $pythonBinary = $pythonCommand.Source
    }
}
if (-not $pythonBinary) {
    $bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $bundledPython) {
        $pythonBinary = $bundledPython
    }
}

if (-not $pythonBinary -or -not (Test-Path -LiteralPath $pythonBinary)) {
    Write-Output 'Python não encontrado; os novos registros permanecerão com tradução pendente.'
    exit 0
}

& $phpBinary (Join-Path $PSScriptRoot 'translate_lorcana.php') "--python=$pythonBinary"
if ($LASTEXITCODE -ne 0) {
    throw 'A tradução das novas cartas falhou.'
}
