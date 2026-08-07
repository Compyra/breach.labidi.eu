# Dev helper: render a page in headless Edge and print the self-test results.
# Used because the interactive browser tooling in the editor is unreliable.
#   powershell -File run-selftest.ps1
param(
    [string]$Url = 'http://127.0.0.1:8877/logscope/selftest.html'
)

$edge = @(
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { Write-Output 'No Edge found'; exit 1 }

$dom = Join-Path $env:TEMP 'bl-dom.html'
$errFile = Join-Path $env:TEMP 'bl-err.txt'
$profileDir = Join-Path $env:TEMP 'bl-edge-profile'
Remove-Item $dom, $errFile -ErrorAction SilentlyContinue

$argList = @(
    '--headless=new'
    '--disable-gpu'
    '--no-sandbox'
    '--no-first-run'
    '--disable-extensions'
    "--user-data-dir=$profileDir"
    '--virtual-time-budget=10000'
    '--dump-dom'
    $Url
)

$proc = Start-Process -FilePath $edge -ArgumentList $argList -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $dom -RedirectStandardError $errFile

$size = 0
if (Test-Path $dom) { $size = (Get-Item $dom).Length }
Write-Output "exit=$($proc.ExitCode) domBytes=$size"

if ($size -gt 0) {
    $html = Get-Content $dom -Raw
    # summary line
    if ($html -match '<p id="summary"[^>]*>(.*?)</p>') {
        Write-Output ("SUMMARY: " + ($matches[1] -replace '<[^>]+>', ''))
    }
    # each assertion
    [regex]::Matches($html, '<li class="(pass|fail)">(.*?)</li>') | ForEach-Object {
        $cls = $_.Groups[1].Value
        $txt = ($_.Groups[2].Value -replace '<[^>]+>', '').Trim()
        if ($cls -eq 'fail') { Write-Output "FAIL  $txt" } else { Write-Output "ok    $txt" }
    }
}
else {
    Write-Output '--- stderr ---'
    if (Test-Path $errFile) { Get-Content $errFile -Raw }
}
