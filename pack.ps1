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
$binaryMetadataPath = Join-Path $addonDirectory "chrome\content\DownloadItBinaryMetadata.sys.mjs"
$generatedMetadataCreated = $false
$ariaNgRepository = "mayswind/AriaNg"
$ariaNgVersion = "1.3.14"
$ariaNgReleaseName = "AriaNg-1.3.14-AllInOne.zip"
$ariaNgArchiveSize = [Int64]701921
$ariaNgArchiveSha256 = "65bc5ed3573ef05313ea953a5c5363c8b33a4996849b2986c78660eab1a9edb2"
$ariaNgIndexSize = [Int64]2321502
$ariaNgIndexSha256 = "ca2b51e09757159a4664b41423d5a8edb1c539e1a4700f568bfa1588bd896646"
$ariaNgLicenseSize = [Int64]1097
$ariaNgLicenseSha256 = "cbfd5dc92e3fd24a52362a439a12f4584868bbb5bb28faaed37abd2d972fc9d7"
$ariaNgDirectory = Join-Path $addonDirectory "ariang"
$ariaNgIndexPath = Join-Path $ariaNgDirectory "index.html"
$ariaNgLicensePath = Join-Path $addonDirectory "licenses\ariang-LICENSE"
$aria2NextRepository = "AnInsomniacy/aria2-next"
$aria2NextVersion = "2.5.5"
$aria2NextAssets = @(
    [PSCustomObject]@{
        Key = "windows"
        ResourceName = "aria2-next.exe"
        ProfileName = "aria2-next.exe"
        ReleaseName = "aria2-next-2.5.5-windows-x86_64.exe"
        Size = [Int64]4555264
        Sha256 = "554f2f81ca53731dc9e01710cfb16081a34759f3276ff16eb4b12656c1b6e5b9"
    }
    [PSCustomObject]@{
        Key = "linux-x86_64"
        ResourceName = "aria2-next-linux-x86_64"
        ProfileName = "aria2-next"
        ReleaseName = "aria2-next-2.5.5-linux-x86_64"
        Size = [Int64]3852672
        Sha256 = "b6f2cdadcd34ba16dd7fcb29de4b84c36f893f9b223a9a05157d1892687a45a0"
    }
)
$nightlyRepository = "benzBrake/Grabby-FlashGot"
$nightlyWorkflow = "nightly.yml"
$nightlyBranch = "master"
$nightlyArtifact = "FlashGot-nightly"
$nightlyLinkUrl = "https://nightly.link/benzBrake/Grabby-FlashGot/workflows/nightly.yml/master/FlashGot-nightly.zip"
$githubApiHeaders = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "DownloadIt-pack"
}
$githubToken = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($githubToken)) {
    $githubToken = $env:GH_TOKEN
}
$hasGitHubToken = -not [string]::IsNullOrWhiteSpace($githubToken)
if ($hasGitHubToken) {
    $githubApiHeaders["Authorization"] = "Bearer $githubToken"
}
$requiredEntries = @(
    "bootstrap.js"
    "install.rdf"
    "chrome.manifest"
    "FlashGot.exe"
    "aria2-next.exe"
    "aria2-next-linux-x86_64"
    "ariang/index.html"
    "ariang/manifest.json"
    "licenses/aria2-next-COPYING"
    "licenses/ariang-LICENSE"
    "chrome/content/DownloadItBinaryMetadata.sys.mjs"
    "chrome/content/DownloadItAriaNg.sys.mjs"
    "chrome/content/DownloadItDownloaders.sys.mjs"
    "chrome/content/DownloadItGitHubMirror.sys.mjs"
    "chrome/content/DownloadItIDMBridge.sys.mjs"
    "chrome/content/DownloadItIDMProtocol.sys.mjs"
    "chrome/content/DownloadItLinks.sys.mjs"
    "chrome/content/DownloadItMirrors.sys.mjs"
    "chrome/content/DownloadItPanelView.sys.mjs"
    "chrome/content/icons/downloadit.svg"
    "chrome/content/panel.css"
    "chrome/content/links.xhtml"
    "chrome/content/links.js"
    "chrome/content/links.css"
    "chrome/content/locales/en-US/downloadit.ftl"
    "chrome/content/locales/zh-CN/downloadit.ftl"
)

try {
    if (-not (Test-Path -LiteralPath $addonDirectory -PathType Container)) {
        throw "Add-on directory does not exist: $addonDirectory"
    }

    New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null

    if (-not (Test-Path -LiteralPath $ariaNgIndexPath -PathType Leaf)) {
        $githubCli = Get-Command ghp -ErrorAction SilentlyContinue
        if (-not $githubCli) {
            $githubCli = Get-Command gh -ErrorAction SilentlyContinue
        }
        if (-not $githubCli) {
            throw "GitHub CLI is required to download the pinned AriaNg release asset"
        }

        $ariaNgArchivePath = Join-Path $temporaryDirectory $ariaNgReleaseName
        Write-Output "[INFO] $ariaNgReleaseName not found locally; downloading pinned AriaNg $ariaNgVersion asset"
        & $githubCli release download $ariaNgVersion `
            --repo $ariaNgRepository `
            --pattern $ariaNgReleaseName `
            --output $ariaNgArchivePath `
            --clobber
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to download the pinned AriaNg release asset"
        }

        $ariaNgArchiveFile = Get-Item -LiteralPath $ariaNgArchivePath
        $ariaNgArchiveActualSize = [Int64]$ariaNgArchiveFile.Length
        if ($ariaNgArchiveActualSize -ne $ariaNgArchiveSize) {
            throw "AriaNg archive has invalid size: $ariaNgArchivePath (expected $ariaNgArchiveSize, got $ariaNgArchiveActualSize)"
        }
        $ariaNgArchiveActualHash = (Get-FileHash -LiteralPath $ariaNgArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($ariaNgArchiveActualHash -ne $ariaNgArchiveSha256) {
            throw "AriaNg archive has invalid SHA-256: $ariaNgArchivePath"
        }

        $ariaNgArchive = [IO.Compression.ZipFile]::OpenRead($ariaNgArchivePath)
        try {
            $ariaNgEntries = @($ariaNgArchive.Entries)
            $ariaNgEntryNames = @($ariaNgEntries | ForEach-Object { $_.FullName })
            $expectedAriaNgEntries = @("index.html", "LICENSE")
            $unexpectedAriaNgEntries = @(
                Compare-Object $expectedAriaNgEntries $ariaNgEntryNames
            )
            if (($ariaNgEntryNames.Count -ne $expectedAriaNgEntries.Count) -or $unexpectedAriaNgEntries) {
                throw "The AriaNg archive must contain only index.html and LICENSE at its root"
            }

            New-Item -ItemType Directory -Path $ariaNgDirectory -Force | Out-Null
            $temporaryIndexPath = Join-Path $temporaryDirectory "ariang-index.html"
            $indexEntry = $ariaNgEntries | Where-Object { $_.FullName -eq "index.html" } | Select-Object -First 1
            $indexInput = $indexEntry.Open()
            $indexOutput = [IO.File]::Create($temporaryIndexPath)
            try {
                $indexInput.CopyTo($indexOutput)
            }
            finally {
                $indexOutput.Dispose()
                $indexInput.Dispose()
            }

            $temporaryLicensePath = Join-Path $temporaryDirectory "ariang-LICENSE"
            $licenseEntry = $ariaNgEntries | Where-Object { $_.FullName -eq "LICENSE" } | Select-Object -First 1
            $licenseInput = $licenseEntry.Open()
            $licenseOutput = [IO.File]::Create($temporaryLicensePath)
            try {
                $licenseInput.CopyTo($licenseOutput)
            }
            finally {
                $licenseOutput.Dispose()
                $licenseInput.Dispose()
            }
        }
        finally {
            $ariaNgArchive.Dispose()
        }

        $temporaryLicenseFile = Get-Item -LiteralPath $temporaryLicensePath
        $temporaryLicenseHash = (Get-FileHash -LiteralPath $temporaryLicensePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if (([Int64]$temporaryLicenseFile.Length -ne $ariaNgLicenseSize) -or ($temporaryLicenseHash -ne $ariaNgLicenseSha256)) {
            throw "AriaNg archive LICENSE failed integrity verification"
        }
        [IO.File]::Move($temporaryIndexPath, $ariaNgIndexPath)
        Write-Output "[OK] Extracted $ariaNgIndexPath"
    }

    $ariaNgIndexFile = Get-Item -LiteralPath $ariaNgIndexPath
    $ariaNgIndexActualSize = [Int64]$ariaNgIndexFile.Length
    if ($ariaNgIndexActualSize -ne $ariaNgIndexSize) {
        throw "AriaNg index has invalid size: $ariaNgIndexPath (expected $ariaNgIndexSize, got $ariaNgIndexActualSize)"
    }
    $ariaNgIndexActualHash = (Get-FileHash -LiteralPath $ariaNgIndexPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ariaNgIndexActualHash -ne $ariaNgIndexSha256) {
        throw "AriaNg index has invalid SHA-256: $ariaNgIndexPath"
    }

    $ariaNgLicenseFile = Get-Item -LiteralPath $ariaNgLicensePath
    $ariaNgLicenseActualSize = [Int64]$ariaNgLicenseFile.Length
    $ariaNgLicenseActualHash = (Get-FileHash -LiteralPath $ariaNgLicensePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if (($ariaNgLicenseActualSize -ne $ariaNgLicenseSize) -or ($ariaNgLicenseActualHash -ne $ariaNgLicenseSha256)) {
        throw "Bundled AriaNg license failed integrity verification: $ariaNgLicensePath"
    }
    Write-Output "[INFO] AriaNg index size: $ariaNgIndexActualSize bytes"
    Write-Output "[INFO] AriaNg index SHA-256: $ariaNgIndexActualHash"

    if (-not (Test-Path -LiteralPath $flashGotPath -PathType Leaf)) {
        New-Item -ItemType Directory -Path $nightlyDirectory -Force | Out-Null
        $nightlyArchivePath = Join-Path $temporaryDirectory "$nightlyArtifact.zip"

        if ($hasGitHubToken) {
            Write-Output "[INFO] FlashGot.exe not found locally; downloading the latest nightly build through the GitHub API"
            $workflowRunsUri = "https://api.github.com/repos/$nightlyRepository/actions/workflows/$nightlyWorkflow/runs?branch=$nightlyBranch&status=success&per_page=1"
            $workflowRuns = Invoke-RestMethod -Uri $workflowRunsUri -Headers $githubApiHeaders -Method Get
            $latestRun = $workflowRuns.workflow_runs | Select-Object -First 1
            if (-not $latestRun) {
                throw "No successful nightly build was found in $nightlyRepository"
            }

            $latestRunId = $latestRun.id
            $artifactsUri = "https://api.github.com/repos/$nightlyRepository/actions/runs/$latestRunId/artifacts?per_page=100"
            $artifacts = Invoke-RestMethod -Uri $artifactsUri -Headers $githubApiHeaders -Method Get
            $nightly = $artifacts.artifacts | Where-Object {
                ($_.name -eq $nightlyArtifact) -and (-not $_.expired)
            } | Select-Object -First 1
            if (-not $nightly) {
                throw "The latest successful nightly run has no available $nightlyArtifact artifact"
            }

            $artifactDownloadUrl = $nightly.archive_download_url
            Invoke-WebRequest -Uri $artifactDownloadUrl -Headers $githubApiHeaders -OutFile $nightlyArchivePath
        }
        else {
            Write-Output "[INFO] FlashGot.exe not found locally; downloading the latest nightly build from nightly.link"
            $nightlyLinkHeaders = @{
                "User-Agent" = "DownloadIt-pack"
            }
            Invoke-WebRequest -Uri $nightlyLinkUrl -Headers $nightlyLinkHeaders -OutFile $nightlyArchivePath
        }

        Expand-Archive -LiteralPath $nightlyArchivePath -DestinationPath $nightlyDirectory -Force

        $downloadedFlashGotPath = Join-Path $nightlyDirectory "FlashGot.exe"
        if (-not (Test-Path -LiteralPath $downloadedFlashGotPath -PathType Leaf)) {
            throw "The nightly artifact does not contain FlashGot.exe"
        }
        $downloadedFlashGot = Get-Item -LiteralPath $downloadedFlashGotPath
        if ($downloadedFlashGot.Length -eq 0) {
            throw "The downloaded FlashGot.exe is empty"
        }
        Copy-Item -LiteralPath $downloadedFlashGotPath -Destination $flashGotPath
        Write-Output "[OK] Downloaded $flashGotPath"
    }

    foreach ($aria2NextAsset in $aria2NextAssets) {
        $resourceName = $aria2NextAsset.ResourceName
        $releaseName = $aria2NextAsset.ReleaseName
        $expectedSize = $aria2NextAsset.Size
        $expectedHash = $aria2NextAsset.Sha256
        $aria2NextPath = Join-Path $addonDirectory $resourceName
        if (-not (Test-Path -LiteralPath $aria2NextPath -PathType Leaf)) {
            $downloadUri = "https://github.com/$aria2NextRepository/releases/download/v$aria2NextVersion/$releaseName"
            $downloadHeaders = @{
                "User-Agent" = "DownloadIt-pack"
            }
            Write-Output "[INFO] $releaseName not found locally; downloading pinned Aria2Next v$aria2NextVersion asset"
            Invoke-WebRequest -Uri $downloadUri -Headers $downloadHeaders -OutFile $aria2NextPath
            Write-Output "[OK] Downloaded $aria2NextPath"
        }

        $aria2NextFile = Get-Item -LiteralPath $aria2NextPath
        $actualSize = [Int64]$aria2NextFile.Length
        if ($actualSize -ne $expectedSize) {
            throw "Aria2Next asset has invalid size: $aria2NextPath (expected $expectedSize, got $actualSize)"
        }
        $actualHash = (Get-FileHash -LiteralPath $aria2NextPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $expectedHash) {
            throw "Aria2Next asset has invalid SHA-256: $aria2NextPath"
        }
        Write-Output "[INFO] $resourceName size: $actualSize bytes"
        Write-Output "[INFO] $resourceName SHA-256: $actualHash"
    }

    $flashGotFile = Get-Item -LiteralPath $flashGotPath
    $flashGotHash = (Get-FileHash -LiteralPath $flashGotPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "[INFO] FlashGot.exe size: $($flashGotFile.Length) bytes"
    Write-Output "[INFO] FlashGot.exe SHA-256: $flashGotHash"

    if (Test-Path -LiteralPath $binaryMetadataPath -PathType Leaf) {
        throw "Generated binary metadata file already exists: $binaryMetadataPath"
    }

    $aria2NextMetadataLines = @()
    foreach ($aria2NextAsset in $aria2NextAssets) {
        $key = $aria2NextAsset.Key
        $resourceName = $aria2NextAsset.ResourceName
        $profileName = $aria2NextAsset.ProfileName
        $size = $aria2NextAsset.Size
        $sha256 = $aria2NextAsset.Sha256
        $aria2NextMetadataLines += "  `"$key`": Object.freeze({ resourceName: `"$resourceName`", profileName: `"$profileName`", size: $size, sha256: `"$sha256`" }),"
    }
    $aria2NextMetadata = $aria2NextMetadataLines -join "`n"
    $binaryMetadata = @"
// Generated by pack.ps1. Do not edit this file directly.
export const BINARY_SIZE = $($flashGotFile.Length);
export const BINARY_SHA256 = "$flashGotHash";
export const ARIA2NEXT_BINARY_METADATA = Object.freeze({
$aria2NextMetadata
});
"@
    $generatedMetadataCreated = $true
    [IO.File]::WriteAllText(
        $binaryMetadataPath,
        $binaryMetadata,
        [Text.UTF8Encoding]::new($false)
    )

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
    if ($generatedMetadataCreated -and (Test-Path -LiteralPath $binaryMetadataPath -PathType Leaf)) {
        Remove-Item -LiteralPath $binaryMetadataPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
