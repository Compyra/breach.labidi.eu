# Dev helper: mobile-width screenshots of the pages that carry the most layout
# risk (wide tables, <pre> query blocks, catalogue rows).
#   powershell -File shots.ps1
$edge = @(
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Output 'No Edge found'; exit 1 }

$profileDir = Join-Path $env:TEMP 'bl-edge-profile'
$shots = 'c:\Temp\bl-shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null

$base = 'http://127.0.0.1:8877/'
$pages = [ordered]@{
    'logscope'    = $base + 'logscope/'
    'audittriage' = $base + '#/play/pro-audit-triage'
    'devicecode'  = $base + '#/play/pro-device-code'
    'logsources'  = $base + '#/play/pro-log-collection'
    'phishtree'   = $base + '#/t/pro-phish'
}

foreach ($k in $pages.Keys) {
    $png = Join-Path $shots "$k.png"
    Remove-Item $png -ErrorAction SilentlyContinue
    $a = @(
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        "--user-data-dir=$profileDir", '--window-size=360,1000',
        '--virtual-time-budget=8000', "--screenshot=$png", $pages[$k]
    )
    Start-Process -FilePath $edge -ArgumentList $a -NoNewWindow -Wait | Out-Null
    $sz = 0; if (Test-Path $png) { $sz = (Get-Item $png).Length }
    Write-Output ("{0,-14} {1,8} bytes  {2}" -f $k, $sz, $png)
}
