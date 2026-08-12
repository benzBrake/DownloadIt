Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDirectory = Split-Path -Parent $scriptDirectory
$addonDirectory = Join-Path $projectDirectory "addon"
$flashGotPath = Join-Path $addonDirectory "FlashGot.exe"
$xpiPath = Join-Path $projectDirectory "addon.xpi"
$temporaryRoot = Join-Path $projectDirectory ".tmp"
$temporaryDirectory = Join-Path $temporaryRoot ([IO.Path]::GetRandomFileName())
$nightlyDirectory = Join-Path $temporaryDirectory "FlashGot-nightly"
$temporaryArchivePath = Join-Path $temporaryDirectory "addon.xpi"
$binaryMetadataPath = Join-Path $addonDirectory "chrome\content\DownloadItBinaryMetadata.sys.mjs"
$generatedMetadataCreated = $false
$ariaNgRepository = "mayswind/AriaNg"
$ariaNgVersion = "1.3.14"
$ariaNgReleaseName = "AriaNg-1.3.14.zip"
$ariaNgArchiveSize = [Int64]1126362
$ariaNgArchiveSha256 = "e00db79b4cabac70f71c2673a6d454c8a92bfa9aa1f37bb00b01b7505f956805"
$ariaNgIndexSize = [Int64]11418
$ariaNgIndexSha256 = "76b9dfe56ac19ff5d11578e7e07634601739628716623a95acf389b03a80c1f1"
$ariaNgLicenseSize = [Int64]1097
$ariaNgLicenseSha256 = "cbfd5dc92e3fd24a52362a439a12f4584868bbb5bb28faaed37abd2d972fc9d7"
$ariaNgAssets = @(
    [PSCustomObject]@{ Path = "css/aria-ng-f90ba723d9.min.css"; Size = [Int64]34711; Sha256 = "a03e4b77b1725f2e428a12f331c0120d280597161258f1cabd67dc124ff5bcd9" }
    [PSCustomObject]@{ Path = "css/bootstrap-3.4.1.min.css"; Size = [Int64]121412; Sha256 = "c28eb8900abce3c478234e62390838556d839c10b7073b2ba42bcbae20d6e2fc" }
    [PSCustomObject]@{ Path = "css/plugins-ccac6fc3fc.min.css"; Size = [Int64]167377; Sha256 = "a373cdf8d64be9b1938cefdfa03fd43f5ba794c51b7de783806dd16b988203ee" }
    [PSCustomObject]@{ Path = "js/angular-packages-1.6.10.min.js"; Size = [Int64]217156; Sha256 = "629638fb36f6f74049c6350651ab0815c8517248720f12084b117d3d96aefbd9" }
    [PSCustomObject]@{ Path = "js/aria-ng-a5324ae04a.min.js"; Size = [Int64]282451; Sha256 = "d8ff216c8c5c8a845e8382430b68c8195dc82745808a9a9df2f5f1278bd1140e" }
    [PSCustomObject]@{ Path = "js/bootstrap-3.4.1.min.js"; Size = [Int64]39680; Sha256 = "9ee2fcff6709e4d0d24b09ca0fc56aade12b4961ed9c43fd13b03248bfb57afe" }
    [PSCustomObject]@{ Path = "js/echarts-common-3.8.5.min.js"; Size = [Int64]401142; Sha256 = "b2d40b7e8c9b925f00213bbe9944ae765f5637f1657921b744a5f3946c98c4c1" }
    [PSCustomObject]@{ Path = "js/jquery-3.3.1.min.js"; Size = [Int64]88145; Sha256 = "0925e8ad7bd971391a8b1e98be8e87a6971919eb5b60c196485941c3c1df089a" }
    [PSCustomObject]@{ Path = "js/moment-with-locales-2.29.4.min.js"; Size = [Int64]61737; Sha256 = "908ac76e9f34dc138359de91d570ce3ec972246fb892ffc2638c9a0339d94012" }
    [PSCustomObject]@{ Path = "js/plugins-b3cb190423.min.js"; Size = [Int64]123750; Sha256 = "a3dae6fd4117844fc189201acaf85ff841ebf29f7c0dd680c8fa6ef36e9ccf96" }
    [PSCustomObject]@{ Path = "fonts/fontawesome-webfont.woff2"; Size = [Int64]77160; Sha256 = "2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe" }
)
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
    "ariang/css/aria-ng-f90ba723d9.min.css"
    "ariang/css/bootstrap-3.4.1.min.css"
    "ariang/css/plugins-ccac6fc3fc.min.css"
    "ariang/js/angular-packages-1.6.10.min.js"
    "ariang/js/aria-ng-a5324ae04a.min.js"
    "ariang/js/bootstrap-3.4.1.min.js"
    "ariang/js/echarts-common-3.8.5.min.js"
    "ariang/js/jquery-3.3.1.min.js"
    "ariang/js/moment-with-locales-2.29.4.min.js"
    "ariang/js/plugins-b3cb190423.min.js"
    "ariang/fonts/fontawesome-webfont.woff2"
    "licenses/aria2-next-COPYING"
    "licenses/ariang-LICENSE"
    "chrome/content/DownloadItBinaryMetadata.sys.mjs"
    "chrome/content/DownloadItAriaNg.sys.mjs"
    "chrome/content/DownloadItAriaNgActor.sys.mjs"
    "chrome/content/DownloadItDownloaders.sys.mjs"
    "chrome/content/DownloadItExternalProtocol.sys.mjs"
    "chrome/content/DownloadItGitHubMirror.sys.mjs"
    "chrome/content/DownloadItIDMBridge.sys.mjs"
    "chrome/content/DownloadItIDMProtocol.sys.mjs"
    "chrome/content/DownloadItLinks.sys.mjs"
    "chrome/content/DownloadItMirrors.sys.mjs"
    "chrome/content/DownloadItPanelView.sys.mjs"
    "chrome/content/DownloadItChrome.sys.mjs"
    "chrome/content/chrome.css"
    "chrome/content/icons/downloadit.svg"
    "chrome/content/panel.css"
    "chrome/content/links.xhtml"
    "chrome/content/links.js"
    "chrome/content/links.css"
    "chrome/content/locales/en-US/downloadit.ftl"
    "chrome/content/locales/ja/downloadit.ftl"
    "chrome/content/locales/zh-CN/downloadit.ftl"
    "chrome/content/locales/zh-TW/downloadit.ftl"
)

try {
    if (-not (Test-Path -LiteralPath $addonDirectory -PathType Container)) {
        throw "Add-on directory does not exist: $addonDirectory"
    }

    New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null

    $ariaNgAssetReady = $false
    if (Test-Path -LiteralPath $ariaNgIndexPath -PathType Leaf) {
        $ariaNgExistingIndex = Get-Item -LiteralPath $ariaNgIndexPath
        $ariaNgExistingHash = (Get-FileHash -LiteralPath $ariaNgIndexPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $ariaNgAssetReady = ([Int64]$ariaNgExistingIndex.Length -eq $ariaNgIndexSize) -and
            ($ariaNgExistingHash -eq $ariaNgIndexSha256)
        if ($ariaNgAssetReady -and (Test-Path -LiteralPath $ariaNgLicensePath -PathType Leaf)) {
            $ariaNgExistingLicense = Get-Item -LiteralPath $ariaNgLicensePath
            $ariaNgExistingLicenseHash = (Get-FileHash -LiteralPath $ariaNgLicensePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $ariaNgAssetReady = ([Int64]$ariaNgExistingLicense.Length -eq $ariaNgLicenseSize) -and
                ($ariaNgExistingLicenseHash -eq $ariaNgLicenseSha256)
        }
        else {
            $ariaNgAssetReady = $false
        }
        foreach ($ariaNgAsset in $ariaNgAssets) {
            $ariaNgAssetPath = Join-Path $ariaNgDirectory $ariaNgAsset.Path.Replace("/", "\")
            if (-not (Test-Path -LiteralPath $ariaNgAssetPath -PathType Leaf)) {
                $ariaNgAssetReady = $false
                break
            }
            $ariaNgAssetFile = Get-Item -LiteralPath $ariaNgAssetPath
            $ariaNgAssetHash = (Get-FileHash -LiteralPath $ariaNgAssetPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if (([Int64]$ariaNgAssetFile.Length -ne $ariaNgAsset.Size) -or ($ariaNgAssetHash -ne $ariaNgAsset.Sha256)) {
                $ariaNgAssetReady = $false
                break
            }
        }
    }

    if (-not $ariaNgAssetReady) {
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
            foreach ($ariaNgEntryName in $ariaNgEntryNames) {
                if ($ariaNgEntryName.StartsWith("/") -or $ariaNgEntryName.Contains("..")) {
                    throw "The AriaNg archive contains an unsafe entry: $ariaNgEntryName"
                }
            }
            foreach ($requiredAriaNgEntry in @(
                "index.html"
                "css/aria-ng-f90ba723d9.min.css"
                "js/aria-ng-a5324ae04a.min.js"
                "fonts/fontawesome-webfont.woff2"
            )) {
                if (-not ($ariaNgEntryNames -contains $requiredAriaNgEntry)) {
                    throw "The AriaNg archive is missing required entry: $requiredAriaNgEntry"
                }
            }

            New-Item -ItemType Directory -Path $ariaNgDirectory -Force | Out-Null
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
        New-Item -ItemType Directory -Path (Split-Path -Parent $ariaNgLicensePath) -Force | Out-Null
        Copy-Item -LiteralPath $temporaryLicensePath -Destination $ariaNgLicensePath -Force

        Expand-Archive -LiteralPath $ariaNgArchivePath -DestinationPath $ariaNgDirectory -Force
        $ariaNgIndexContent = [IO.File]::ReadAllText($ariaNgIndexPath)
        $ariaNgIndexMarker = '<html ng-app="ariaNg">'
        if (-not $ariaNgIndexContent.Contains($ariaNgIndexMarker)) {
            throw "AriaNg index does not contain the expected Angular application root"
        }
        $ariaNgIndexContent = $ariaNgIndexContent.Replace(
            $ariaNgIndexMarker,
            '<html ng-app="ariaNg" ng-csp="no-unsafe-eval">'
        )
        [IO.File]::WriteAllText($ariaNgIndexPath, $ariaNgIndexContent, [Text.UTF8Encoding]::new($false))
        Write-Output "[OK] Extracted AriaNg assets to $ariaNgDirectory"
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
    $ariaNgIndexContent = [IO.File]::ReadAllText($ariaNgIndexPath)
    if ([regex]::IsMatch($ariaNgIndexContent, '<script\b(?![^>]*\bsrc\s*=)[^>]*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        throw "AriaNg index contains an inline script, which is blocked by the extension CSP"
    }
    foreach ($ariaNgAsset in $ariaNgAssets) {
        $ariaNgAssetPath = Join-Path $ariaNgDirectory $ariaNgAsset.Path.Replace("/", "\")
        if (-not (Test-Path -LiteralPath $ariaNgAssetPath -PathType Leaf)) {
            throw "AriaNg asset is missing: $ariaNgAssetPath"
        }
        $ariaNgAssetFile = Get-Item -LiteralPath $ariaNgAssetPath
        $ariaNgAssetHash = (Get-FileHash -LiteralPath $ariaNgAssetPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if (([Int64]$ariaNgAssetFile.Length -ne $ariaNgAsset.Size) -or ($ariaNgAssetHash -ne $ariaNgAsset.Sha256)) {
            throw "AriaNg asset has invalid integrity: $ariaNgAssetPath"
        }
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
