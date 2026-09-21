$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.deploy'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $deployRoot 'release'))

if (-not $deployRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw 'Diretorio de deploy fora do projeto.'
}

Push-Location $projectRoot
try {
    npm run build:client
    if ($LASTEXITCODE -ne 0) {
        throw 'O build do cliente falhou.'
    }

    if (Test-Path -LiteralPath $releaseRoot) {
        if (-not $releaseRoot.StartsWith($deployRoot + [IO.Path]::DirectorySeparatorChar)) {
            throw 'Diretorio de release inseguro.'
        }
        Remove-Item -LiteralPath $releaseRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

    foreach ($file in @('.htaccess', 'index.php')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $releaseRoot $file)
    }

    foreach ($directory in @('api', 'client')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $releaseRoot $directory) -Recurse
    }

    $releaseConfig = Join-Path $releaseRoot 'config'
    New-Item -ItemType Directory -Path $releaseConfig -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'config') -File -Filter '*.php' |
        Where-Object { $_.Name -notlike '*.example.php' -and $_.Name -ne 'database.credentials.php' } |
        Copy-Item -Destination $releaseConfig

    $files = @(Get-ChildItem -LiteralPath $releaseRoot -File -Recurse)
    $size = ($files | Measure-Object -Property Length -Sum).Sum
    Write-Host ("Release pronta: {0} arquivos, {1:N2} MB" -f $files.Count, ($size / 1MB))
    Write-Host $releaseRoot
}
finally {
    Pop-Location
}
