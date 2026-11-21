$OutputEncoding=[System.Text.Encoding]::UTF8
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ProgressPreference='SilentlyContinue'
$out = "F:\yeuca\_recon\gh-scan2.jsonl"
Remove-Item $out -ErrorAction SilentlyContinue

$queries = @(
  "self hosted form backend",
  "static site form submission backend",
  "formspree alternative self hosted",
  "cloudflare worker form handler",
  "pagefind search static site",
  "astro pagefind",
  "umami analytics self hosted",
  "plausible analytics",
  "static site generator chinese 中文 主题",
  "acm student chapter site",
  "student club management system",
  "club event management static",
  "astro theme minimal no tailwind",
  "hugo theme minimal no js",
  "github pages actions deploy static"
)

foreach ($q in $queries) {
  $u = "https://api.github.com/search/repositories?q=$([uri]::EscapeDataString($q))&sort=stars&order=desc&per_page=5"
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 25 -Headers @{ "User-Agent"="recon"; "Accept"="application/vnd.github+json" }
    $j = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
    foreach ($it in $j.items) {
      $lic = if ($it.license) { $it.license.spdx_id } else { "none" }
      $d = $it.description; if ($d -and $d.Length -gt 120) { $d = $d.Substring(0,120) }
      $obj = [ordered]@{
        q = $q; repo = $it.full_name; stars = $it.stargazers_count
        lang = $it.language; pushed = $it.pushed_at.Substring(0,10); license = $lic
        desc = ($d -replace '\s+',' '); url = $it.html_url; archived = $it.archived
      }
      ($obj | ConvertTo-Json -Compress) | Add-Content -Path $out -Encoding UTF8
    }
    Write-Output "ok: $q ($($j.total_count))"
  } catch { Write-Output "ERR: $q $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 1200
}
Write-Output "DONE -> $out"
