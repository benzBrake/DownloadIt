Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$addonDirectory = Join-Path $scriptDirectory "addon"
$xpiPath = Join-Path $scriptDirectory "addon.xpi"
$temporaryRoot = Join-Path $scriptDirectory ".tmp"
$temporaryDirectory = Join-Path $temporaryRoot ([IO.Path]::GetRandomFileName())
$temporaryArchivePath = Join-Path $temporaryDirectory "addon.xpi"
$requiredEntries = @(
    "bootstrap.js"
    "install.rdf"
    "chrome.manifest"
    "FlashGot.exe"
)

try {
    if (-not (Test-Path -LiteralPath $addonDirectory -PathType Container)) {
        throw "Add-on directory does not exist: $addonDirectory"
    }

    New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
    [IO.Compression.ZipFile]::CreateFromDirectory(
        $addonDirectory,
        $temporaryArchivePath,
        [IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    $archive = [IO.Compression.ZipFile]::OpenRead($temporaryArchivePath)
    try {
        $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    }
    finally {
        $archive.Dispose()
    }

    if (-not $entryNames) {
        throw "The generated XPI is empty"
    }
    foreach ($requiredEntry in $requiredEntries) {
        if (-not ($entryNames -contains $requiredEntry)) {
            throw "The generated XPI is missing required entry: $requiredEntry"
        }
    }

    if (Test-Path -LiteralPath $xpiPath -PathType Leaf) {
        [IO.File]::Move($temporaryArchivePath, $xpiPath, $true)
    }
    else {
        [IO.File]::Move($temporaryArchivePath, $xpiPath)
    }
    Write-Output "[OK] Created $xpiPath"
}
catch {
    Write-Error "Failed to package DownloadIt: $_"
    exit 1
}
finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
