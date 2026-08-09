[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$InstallManifestPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath,

    [Parameter()]
    [ValidatePattern("^https://")]
    [string]$UpdateLink = "https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rdfNamespace = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
$emNamespace = "http://www.mozilla.org/2004/em-rdf#"
$manifestRoot = "urn:mozilla:install-manifest"

function Get-RequiredManifestValue {
    param(
        [Parameter(Mandatory = $true)]
        [System.Xml.XmlNode]$Description,

        [Parameter(Mandatory = $true)]
        [System.Xml.XmlNamespaceManager]$NamespaceManager,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $node = $Description.SelectSingleNode("em:$Name", $NamespaceManager)
    if (-not $node) {
        throw "install.rdf is missing em:$Name"
    }

    $value = $node.InnerText.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "install.rdf has an empty em:$Name"
    }

    return $value
}

try {
    if (-not (Test-Path -LiteralPath $InstallManifestPath -PathType Leaf)) {
        throw "Install manifest does not exist: $InstallManifestPath"
    }

    $resolvedInstallManifestPath = (Resolve-Path -LiteralPath $InstallManifestPath).Path
    $absoluteOutputPath = [IO.Path]::GetFullPath($OutputPath)
    $outputDirectory = [IO.Path]::GetDirectoryName($absoluteOutputPath)
    if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
        throw "Output path has no parent directory: $OutputPath"
    }
    if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    $document = [System.Xml.XmlDocument]::new()
    $document.PreserveWhitespace = $true
    $document.Load($resolvedInstallManifestPath)

    $namespaceManager = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
    $namespaceManager.AddNamespace("rdf", $rdfNamespace)
    $namespaceManager.AddNamespace("em", $emNamespace)

    $description = $document.SelectSingleNode(
        "/rdf:RDF/rdf:Description[@about='$manifestRoot']",
        $namespaceManager
    )
    if (-not $description) {
        throw "install.rdf is missing the install manifest description"
    }

    $extensionId = Get-RequiredManifestValue $description $namespaceManager "id"
    $version = Get-RequiredManifestValue $description $namespaceManager "version"
    if ($version -notmatch "^\d+\.\d+\.\d+$") {
        throw "install.rdf has an invalid DownloadIt version: $version"
    }

    $targetApplications = @($description.SelectNodes("em:targetApplication/rdf:Description", $namespaceManager))
    if (-not $targetApplications) {
        throw "install.rdf has no target application"
    }

    $writerSettings = [System.Xml.XmlWriterSettings]::new()
    $writerSettings.Encoding = [System.Text.UTF8Encoding]::new($false)
    $writerSettings.Indent = $true
    $writerSettings.NewLineChars = "`n"
    $writerSettings.NewLineHandling = [System.Xml.NewLineHandling]::Replace

    $writer = [System.Xml.XmlWriter]::Create($absoluteOutputPath, $writerSettings)
    try {
        $writer.WriteStartDocument()
        $writer.WriteStartElement("RDF", $rdfNamespace)
        $writer.WriteAttributeString("xmlns", "em", $null, $emNamespace)
        $writer.WriteStartElement("Description", $rdfNamespace)
        $writer.WriteAttributeString("about", $manifestRoot.Replace("install-manifest", "extension:$extensionId"))
        $writer.WriteStartElement("em", "updates", $emNamespace)
        $writer.WriteStartElement("Seq", $rdfNamespace)
        $writer.WriteStartElement("li", $rdfNamespace)
        $writer.WriteStartElement("Description", $rdfNamespace)
        $writer.WriteElementString("em", "version", $emNamespace, $version)

        foreach ($targetApplication in $targetApplications) {
            $applicationId = Get-RequiredManifestValue $targetApplication $namespaceManager "id"
            $minVersion = Get-RequiredManifestValue $targetApplication $namespaceManager "minVersion"
            $maxVersion = Get-RequiredManifestValue $targetApplication $namespaceManager "maxVersion"

            $writer.WriteStartElement("em", "targetApplication", $emNamespace)
            $writer.WriteStartElement("Description", $rdfNamespace)
            $writer.WriteElementString("em", "id", $emNamespace, $applicationId)
            $writer.WriteElementString("em", "minVersion", $emNamespace, $minVersion)
            $writer.WriteElementString("em", "maxVersion", $emNamespace, $maxVersion)
            $writer.WriteElementString("em", "updateLink", $emNamespace, $UpdateLink)
            $writer.WriteEndElement()
            $writer.WriteEndElement()
        }

        $writer.WriteEndElement()
        $writer.WriteEndElement()
        $writer.WriteEndElement()
        $writer.WriteEndElement()
        $writer.WriteEndElement()
        $writer.WriteEndDocument()
    }
    finally {
        $writer.Dispose()
    }

    Write-Output "[OK] Created $absoluteOutputPath"
}
catch {
    Write-Error "Failed to generate update manifest: $_"
    exit 1
}
