param(
    [switch] $Publish
)

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployRoot = Join-Path $projectRoot '.deploy'
$releaseRoot = Join-Path $deployRoot 'release'
$ftpConfig = Join-Path $deployRoot 'ftp.curl.conf'
# A conta FTP da KingHost ja inicia em /www. Caminhos abaixo deste endereco
# sao relativos a esse diretorio; acrescentar /www criaria /www/www.
$remoteBase = 'ftp://ftp.jogartcg.com.br'

& (Join-Path $PSScriptRoot 'build-release.ps1')

if (-not (Test-Path -LiteralPath $ftpConfig -PathType Leaf)) {
    throw 'Arquivo privado .deploy/ftp.curl.conf nao encontrado.'
}
& curl.exe --config $ftpConfig --list-only "$remoteBase/" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel acessar o diretorio remoto de producao.'
}
Write-Host 'Conexao FTP e diretorio remoto validados.'

$releaseFiles = @(Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Sort-Object FullName)
$releasePrefixLength = $releaseRoot.TrimEnd('\').Length + 1
Write-Host ''
Write-Host 'Arquivos permitidos para producao:'
$releaseFiles | ForEach-Object {
    Write-Host ('  ' + $_.FullName.Substring($releasePrefixLength).Replace('\', '/'))
}

if (-not $Publish) {
    Write-Host ''
    Write-Host 'Simulacao concluida. Execute npm run deploy para publicar.'
    exit 0
}

function ConvertTo-FtpPath([string] $relativePath) {
    return (($relativePath.Replace('\', '/') -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
}

foreach ($file in $releaseFiles) {
    $relativePath = $file.FullName.Substring($releasePrefixLength)
    $remotePath = ConvertTo-FtpPath $relativePath
    Write-Host ('Enviando ' + $relativePath.Replace('\', '/'))
    & curl.exe --config $ftpConfig --ftp-create-dirs --upload-file $file.FullName "$remoteBase/$remotePath"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao enviar $relativePath"
    }
}

Write-Host 'Publicacao concluida.'
