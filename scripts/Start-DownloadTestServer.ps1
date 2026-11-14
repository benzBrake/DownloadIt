[CmdletBinding()]
param(
    [Parameter(Position = 0)][ValidateSet('start', 'stop')][string]$Action = 'start',
    [ValidateRange(1, 65535)][int]$Port = 8765,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$containerName = "downloadit-test-server-$Port"
$image = 'python:3.13-slim'
$serviceDirectory = (Resolve-Path (Join-Path $PSScriptRoot 'download-test-server')).Path
$url = "http://localhost:$Port/"
$label = "downloadit.test-server=v1"

function Test-ServiceReady {
    try {
        # Publish uses IPv4 loopback; avoid localhost's IPv6 fallback delay.
        $request = @{ Uri = "http://127.0.0.1:$Port/health"; TimeoutSec = 3; UseBasicParsing = $true }
        if ($PSVersionTable.PSVersion.Major -ge 6) { $request.NoProxy = $true }
        $response = Invoke-WebRequest @request
        return $response.StatusCode -eq 200 -and $response.Content.Trim() -eq 'downloadit-test-server-v1'
    } catch { return $false }
}

if (-not (Get-Command wslc -ErrorAction SilentlyContinue)) {
    throw 'wslc is required. Install and configure WSL containers first.'
}

# Inspect only our name; never replace or stop a conflicting container.
$previousErrorAction = $ErrorActionPreference
try {
    # Windows PowerShell turns redirected native stderr into error records.
    # A missing container is expected here; use the native exit code instead.
    $ErrorActionPreference = 'Continue'
    $inspection = & wslc inspect --type container $containerName 2>$null
    $exists = $LASTEXITCODE -eq 0
} finally { $ErrorActionPreference = $previousErrorAction }
if ($exists) {
    $container = @($inspection | ConvertFrom-Json)[0]
    $binding = @($container.Ports.'8765/tcp')
    $mount = @($container.Mounts | Where-Object { $_.Destination -eq '/app' })
    if ($container.Config.Labels.'downloadit.test-server' -ne 'v1' -or
        $container.Config.Image -ne $image -or
        $binding.Count -ne 1 -or $binding[0].HostIp -ne '127.0.0.1' -or $binding[0].HostPort -ne "$Port" -or
        $container.Config.WorkingDir -ne '/app' -or
        ($container.Config.Cmd -join ' ') -ne 'python -B -u server.py --host 0.0.0.0 --port 8765' -or
        $mount.Count -ne 1 -or $mount[0].ReadWrite -ne $false -or
        $mount[0].Source.Replace('\', '/').TrimEnd('/') -ine $serviceDirectory.Replace('\', '/').TrimEnd('/')) {
        throw "Container $containerName does not match this service. Inspect it manually; no container was changed."
    }
    if ($Action -eq 'stop') {
        & wslc stop $containerName
        if ($LASTEXITCODE -ne 0) { throw "Could not stop $containerName." }
        Write-Host "Stopped $containerName"
        return
    }
    if (-not $container.State.Running -or -not (Test-ServiceReady)) {
        & wslc logs --tail 30 $containerName
        throw "Container $containerName is stopped or unhealthy. Inspect it manually."
    }
    Write-Host "Reusing $containerName"
} else {
    if ($Action -eq 'stop') {
        Write-Host "$containerName is already stopped (container not found)."
        return
    }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() } catch { throw "Local port $Port is already in use. Choose another -Port." }
    finally { $listener.Stop() }
    Write-Host "Starting $containerName (first run may pull $image)..."
    & wslc run --detach --rm --name $containerName --label $label --publish "127.0.0.1:${Port}:8765" --volume "${serviceDirectory}:/app:ro" --workdir /app $image python -B -u server.py --host 0.0.0.0 --port 8765
    if ($LASTEXITCODE -ne 0) {
        & wslc logs --tail 30 $containerName
        throw 'WSLC could not start the download test server.'
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-ServiceReady) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        & wslc logs --tail 30 $containerName
        throw "Server did not become ready. Stop it with: DownloadTestServer.cmd stop -Port $Port"
    }
}

Write-Host "Download test page: $url"
Write-Host "Stop: DownloadTestServer.cmd stop -Port $Port"
if (-not $NoOpen) { Start-Process $url }
