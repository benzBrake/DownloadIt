Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$addonDirectory = Join-Path $scriptDirectory "addon"
$flashGotPath = Join-Path $addonDirectory "FlashGot.exe"
$xpiPath = Join-Path $scriptDirectory "addon.xpi"
$temporaryRoot = Join-Path $scriptDirectory ".tmp"
$temporaryDirectory = Join-Path $temporaryRoot ([IO.Path]::GetRandomFileName())
$nightlyDirectory = Join-Path $temporaryDirectory "FlashGot-nightly"
$temporaryArchivePath = Join-Path $temporaryDirectory "addon.xpi"
$nightlyRepository = "benzBrake/Grabby-FlashGot"
$nightlyWorkflow = "nightly.yml"
$nightlyArtifact = "FlashGot-nightly"
$githubApiHeaders = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "DownloadIt-pack"
}
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

    if (-not (Test-Path -LiteralPath $flashGotPath -PathType Leaf)) {
        Write-Output "[INFO] FlashGot.exe not found locally; downloading the latest nightly build"
        $workflowRunsUri = "https://api.github.com/repos/$nightlyRepository/actions/workflows/$nightlyWorkflow/runs?status=success&per_page=1"
        $workflowRuns = Invoke-RestMethod -Uri $workflowRunsUri -Headers $githubApiHeaders -Method Get
        $latestRun = $workflowRuns.workflow_runs | Select-Object -First 1
        if (-not $latestRun) {
            throw "No successful nightly build was found in $nightlyRepository"
        }

        New-Item -ItemType Directory -Path $nightlyDirectory -Force | Out-Null
        $artifactsUri = "https://api.github.com/repos/$nightlyRepository/actions/runs/$($latestRun.id)/artifacts?per_page=100"
        $artifacts = Invoke-RestMethod -Uri $artifactsUri -Headers $githubApiHeaders -Method Get
        $nightly = $artifacts.artifacts | Where-Object {
            ($_.name -eq $nightlyArtifact) -and (-not $_.expired)
        } | Select-Object -First 1
        if (-not $nightly) {
            throw "The latest successful nightly run has no available $nightlyArtifact artifact"
        }

        $nightlyArchivePath = Join-Path $temporaryDirectory "$nightlyArtifact.zip"
        Invoke-WebRequest -Uri $nightly.archive_download_url -Headers $githubApiHeaders -OutFile $nightlyArchivePath
        Expand-Archive -LiteralPath $nightlyArchivePath -DestinationPath $nightlyDirectory -Force

        $downloadedFlashGotPath = Join-Path $nightlyDirectory "FlashGot.exe"
        if (-not (Test-Path -LiteralPath $downloadedFlashGotPath -PathType Leaf)) {
            throw "The nightly artifact does not contain FlashGot.exe"
        }
        Copy-Item -LiteralPath $downloadedFlashGotPath -Destination $flashGotPath
        Write-Output "[OK] Downloaded $flashGotPath"
    }

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
