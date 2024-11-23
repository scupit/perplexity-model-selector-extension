$outFile = '.\perplexity-model-selector.xpi'
$7zPath = (Get-Command 7z -ErrorAction SilentlyContinue).Path

if (-not $7zPath) {
  Write-Error "7zip (7z) executable not found. Please install 7zip or ensure it is in the system PATH."
  exit 1
}

if (Test-Path $outFile) {
  Remove-Item $outFile
}

7z a -tzip $outFile .\content_script.js .\manifest.json .\styles.css
