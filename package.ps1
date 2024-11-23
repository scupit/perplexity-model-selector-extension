$outFile = '.\perplexity-model-selector.xpi'
if (Test-Path $outFile) {
  Remove-Item $outFile
}

7z a -tzip $outFile .\content_script.js .\manifest.json .\styles.css
