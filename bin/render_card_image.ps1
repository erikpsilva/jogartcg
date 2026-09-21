param(
    [int]$CardId = 7,
    [string]$OutputPath = ""
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot "storage\generated\cards\pt-br\card-$CardId.png"
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$browserCandidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $browserPath) {
    throw 'Chrome ou Edge não foi encontrado para gerar a imagem.'
}

$tempRoot = (Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
$profilePath = Join-Path $tempRoot ("jogartcg-render-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $profilePath | Out-Null

$renderUrl = "http://localhost/jogartcg/carta-renderizada?id=$CardId"
$arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-extensions',
    "--user-data-dir=$profilePath",
    '--window-size=450,628',
    '--force-device-scale-factor=2',
    '--virtual-time-budget=5000',
    "--screenshot=$OutputPath",
    $renderUrl
)

try {
    & $browserPath @arguments | Out-Null

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw 'O navegador terminou sem criar a imagem.'
    }

    Write-Output $OutputPath
} finally {
    $resolvedProfile = Resolve-Path -LiteralPath $profilePath -ErrorAction SilentlyContinue
    if ($resolvedProfile -and $resolvedProfile.Path.StartsWith($tempRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedProfile.Path -Recurse -Force
    }
}
