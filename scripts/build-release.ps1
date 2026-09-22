$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.deploy'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $deployRoot 'release'))

if (-not $deployRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw 'Diretorio de deploy fora do projeto.'
}

Push-Location $projectRoot
try {
    npm run build:admin
    if ($LASTEXITCODE -ne 0) { throw 'O build do admin falhou.' }
    npm run build:client
    if ($LASTEXITCODE -ne 0) {
        throw 'O build do cliente falhou.'
    }
    # Arbitro das partidas online: build:server gera o pacote unico com o motor embutido.
    npm run build:core
    if ($LASTEXITCODE -ne 0) { throw 'O build do motor falhou.' }
    npm run build:server
    if ($LASTEXITCODE -ne 0) { throw 'O build do arbitro falhou.' }
    $refereeBundle = Join-Path $projectRoot 'services/game-server/dist/referee.bundle.mjs'
    if (-not (Test-Path -LiteralPath $refereeBundle -PathType Leaf)) {
        throw 'Pacote do arbitro nao gerado (services/game-server/dist/referee.bundle.mjs).'
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

    # Only runtime assets: no LESS sources, test fixtures or dependency directories.
    foreach ($directory in @('admin', 'assets/fontawesome')) {
        $sourceRoot = Join-Path $projectRoot $directory
        Get-ChildItem -LiteralPath $sourceRoot -File -Recurse |
            Where-Object { $_.Extension -in @('.php', '.js', '.css', '.woff2', '.woff', '.ttf', '.eot', '.png', '.svg') } |
            ForEach-Object {
                $relative = $_.FullName.Substring($projectRoot.Length + 1)
                $target = Join-Path $releaseRoot $relative
                New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
                Copy-Item -LiteralPath $_.FullName -Destination $target
            }
    }

    # O PHP executa o arbitro pelo Node; o navegador nunca deve acessar a pasta.
    $releaseReferee = Join-Path $releaseRoot 'services/game-server/dist'
    New-Item -ItemType Directory -Path $releaseReferee -Force | Out-Null
    Copy-Item -LiteralPath $refereeBundle -Destination $releaseReferee
    Set-Content -LiteralPath (Join-Path $releaseRoot 'services/.htaccess') -Value 'Require all denied' -Encoding ascii

    $releaseConfig = Join-Path $releaseRoot 'config'
    New-Item -ItemType Directory -Path $releaseConfig -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'config') -File -Filter '*.php' |
        Where-Object { $_.Name -notlike '*.example.php' -and $_.Name -ne 'database.credentials.php' } |
        Copy-Item -Destination $releaseConfig

    $files = @(Get-ChildItem -LiteralPath $releaseRoot -File -Recurse)
    $forbiddenFiles = @($files | Where-Object {
        $_.Name -match '(?i)(credentials|secret|\.env|\.key|\.pem)' -or
        $_.FullName -match '(?i)database\.credentials\.php$'
    })
    if ($forbiddenFiles.Count -gt 0) {
        $names = ($forbiddenFiles | ForEach-Object { $_.FullName.Substring($releaseRoot.Length + 1) }) -join ', '
        throw "Release bloqueada: arquivo sensivel encontrado ($names)."
    }

    $size = ($files | Measure-Object -Property Length -Sum).Sum
    Write-Host ("Release pronta: {0} arquivos, {1:N2} MB" -f $files.Count, ($size / 1MB))
    Write-Host $releaseRoot
}
finally {
    Pop-Location
}
