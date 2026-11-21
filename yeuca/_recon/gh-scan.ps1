$OutputEncoding=[System.Text.Encoding]::UTF8
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ProgressPreference='SilentlyContinue'
$out = "F:\yeuca\_recon\gh-scan.jsonl"
Remove-Item $out -ErrorAction SilentlyContinue

$queries = @(
  "club website template",
  "computer association website",
  "ACM chapter website",
  "计算机协会 官网",
  "社团 官网 astro",
  "astro blog theme",
  "astro landing page template",
  "hexo theme butterfly",
  "hexo theme fluid",
  "hugo blox",
  "hugo papermod",
  "hugo coder",
  "astro nano",
  "astro paper",
  "nuxt content blog",
  "static site cms markdown 社团"
)

foreach ($q in $queries) {
  $u = "https://api.github.com/search/repositories?q=$([uri]::EscapeDataString($q))&sort=stars&order=desc&per_page=6"
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 25 -Headers @{ "User-Agent"="recon"; "Accept"="application/vnd.github+json" }
    $j = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
    foreach ($it in $j.items) {
      $lic = if ($it.license) { $it.license.spdx_id } else { "none" }
      $obj = [ordered]@{
        q = $q; repo = $it.full_name; stars = $it.stargazers_count
        lang = $it.language; pushed = $it.pushed_at.Substring(0,10); license = $lic
        desc = ($it.description -replace '\s+',' ')
        url = $it.html_url; archived = $it.archived
      }
      ($obj | ConvertTo-Json -Compress) | Add-Content -Path $out -Encoding UTF8
    }
    Write-Output "ok: $q ($($j.total_count))"
  } catch { Write-Output "ERR: $q $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 900
}
Write-Output "DONE -> $out"
