param([switch] $RebuildLegacyAssets)

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.deploy'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $deployRoot 'release'))

if (-not $deployRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw 'Diretorio de deploy fora do projeto.'
}

Push-Location $projectRoot
try {
    # A publicacao padrao usa os assets ja versionados; nao depende de Node.
    # Opt-in somente para manutencao do cliente legado React/TypeScript.
    if ($RebuildLegacyAssets) {
        npm run build:admin
        if ($LASTEXITCODE -ne 0) { throw 'O build do admin falhou.' }
        npm run build:client
        if ($LASTEXITCODE -ne 0) { throw 'O build do cliente falhou.' }
        # Motor legado ainda usado no navegador para partidas contra o bot.
        npm run build:core
        if ($LASTEXITCODE -ne 0) { throw 'O build do motor falhou.' }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'client/index.html'))) {
        throw 'Cliente compilado ausente. Restaure os assets versionados antes de publicar.'
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

    foreach ($directory in @('api', 'client', 'starter-decks')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $releaseRoot $directory) -Recurse
    }

    $starterImages = Join-Path $releaseRoot 'images/starter-decks'
    $inkImages = Join-Path $releaseRoot 'images/icons'
    New-Item -ItemType Directory -Path $inkImages -Force | Out-Null
    foreach ($ink in @('amber','amethyst','emerald','ruby','sapphire','steel')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "images/icons/$ink.webp") -Destination $inkImages
    }
    New-Item -ItemType Directory -Path $starterImages -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'images/starter-decks') -File |
        Where-Object { $_.Extension -in @('.jpg', '.png', '.webp') } |
        Copy-Item -Destination $starterImages

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

    # Configuracao e motor de regras, com as subpastas (config/game e o arbitro das
    # partidas online): copiar so a raiz deixaria o servidor sem o motor.
    $configRoot = Join-Path $projectRoot 'config'
    Get-ChildItem -LiteralPath $configRoot -File -Recurse -Filter '*.php' |
        Where-Object { $_.Name -notlike '*.example.php' -and $_.Name -notlike '*.credentials.php' } |
        ForEach-Object {
            $relative = $_.FullName.Substring($projectRoot.Length + 1)
            $target = Join-Path $releaseRoot $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target
        }
    $engineFiles = @(Get-ChildItem -LiteralPath (Join-Path $releaseRoot 'config/game') -File -Filter '*.php' -ErrorAction SilentlyContinue)
    if ($engineFiles.Count -lt 4) { throw 'Release bloqueada: motor de regras ausente em config/game.' }

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
