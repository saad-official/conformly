# Conformly: wire secrets into Vercel and .env.local.
# Run this yourself (it handles your account keys):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1
#
# Reads:
#   G:\AI Engineering Journey\.env                           -> GEMINI_API_KEY, GROQ_API_KEY
#   G:\Vibe Engineering Apps\.secrets\stripe-secret.txt      -> sk_test_...
#   G:\Vibe Engineering Apps\.secrets\conformly-database-url.txt -> the pooled Postgres connection string
#        (Neon: Dashboard > Connection string, "Pooled connection"; Supabase: the transaction pooler string)
#   G:\Vibe Engineering Apps\.secrets\conformly-database-direct-url.txt (optional) -> direct string for migrations
#   G:\Vibe Engineering Apps\.secrets\conformly-cron-secret.txt
#   G:\Vibe Engineering Apps\.secrets\conformly-better-auth-secret.txt
#   G:\Vibe Engineering Apps\.secrets\conformly-stripe-price.txt
# Creates the Stripe webhook endpoint for production, pushes env vars to Vercel,
# writes .env.local, and runs the database migrations. Never prints secret values.

$ErrorActionPreference = "Stop"
$env:PATH = "C:\tools\node24;" + $env:PATH
Set-Location (Split-Path -Parent $PSScriptRoot)

$secrets = "G:\Vibe Engineering Apps\.secrets"
$journeyEnv = "G:\AI Engineering Journey\.env"
$prodUrl = "https://getconformly.vercel.app"
$stripe = "C:\Users\Dell\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"

function Read-EnvValue($file, $name) {
  if (-not (Test-Path $file)) { throw "Missing $file" }
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { throw "$name not found in $file" }
  return ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"').Trim("'")
}
function Read-Secret($file) {
  if (-not (Test-Path $file)) { throw "Missing $file" }
  return (Get-Content $file -Raw).Trim()
}
function Set-VercelEnv($name, $value, [switch]$Sensitive) {
  $vercelCmd = "C:/Program Files/nodejs/vercel.cmd"
  foreach ($target in @("production", "preview", "development")) {
    $args = @("env", "add", $name, $target, "--force")
    if ($Sensitive) { $args += "--sensitive" }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $value | & $vercelCmd  *> $null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "vercel env add $name ($target) failed with exit code $code" }
  }
  Write-Host "  set $name"
}

Write-Host "Collecting values..."
$gemini = Read-EnvValue $journeyEnv "GEMINI_API_KEY"
$groq = Read-EnvValue $journeyEnv "GROQ_API_KEY"
$cron = Read-Secret "$secrets\conformly-cron-secret.txt"
$authSecret = Read-Secret "$secrets\conformly-better-auth-secret.txt"
$price = Read-Secret "$secrets\conformly-stripe-price.txt"
$stripeSecret = Read-Secret "$secrets\stripe-secret.txt"
if (-not $stripeSecret.StartsWith("sk_test_")) { throw "stripe-secret.txt must hold a test-mode key (sk_test_...)" }
$dbUrl = Read-Secret "$secrets\conformly-database-url.txt"
if (-not $dbUrl.StartsWith("postgres")) { throw "conformly-database-url.txt must hold a postgres:// connection string" }
$directUrl = $dbUrl
if (Test-Path "$secrets\conformly-database-direct-url.txt") { $directUrl = Read-Secret "$secrets\conformly-database-direct-url.txt" }

Write-Host "Creating Stripe webhook endpoint for $prodUrl ..."
$existing = & $stripe webhook_endpoints list --limit 20 | ConvertFrom-Json
$hook = $existing.data | Where-Object { $_.url -eq "$prodUrl/api/webhooks/stripe" } | Select-Object -First 1
if ($hook) {
  Write-Host "  endpoint exists; delete it in the Dashboard and re-run if STRIPE_WEBHOOK_SECRET is unknown."
  $whsec = $null
} else {
  $created = & $stripe webhook_endpoints create --url "$prodUrl/api/webhooks/stripe" `
    --enabled-events checkout.session.completed `
    --enabled-events customer.subscription.created `
    --enabled-events customer.subscription.updated `
    --enabled-events customer.subscription.deleted | ConvertFrom-Json
  $whsec = $created.secret
  Write-Host "  created $($created.id)"
}

Write-Host "Pushing to Vercel..."
Set-VercelEnv "DATABASE_URL" $dbUrl -Sensitive
Set-VercelEnv "BETTER_AUTH_SECRET" $authSecret -Sensitive
Set-VercelEnv "GOOGLE_GENERATIVE_AI_API_KEY" $gemini -Sensitive
Set-VercelEnv "GROQ_API_KEY" $groq -Sensitive
Set-VercelEnv "STRIPE_SECRET_KEY" $stripeSecret -Sensitive
if ($whsec) { Set-VercelEnv "STRIPE_WEBHOOK_SECRET" $whsec -Sensitive }

Write-Host "Writing .env.local..."
@"
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Conformly
DATABASE_URL=$dbUrl
BETTER_AUTH_SECRET=$authSecret
BETTER_AUTH_URL=http://localhost:3000
GROQ_API_KEY=$groq
GOOGLE_GENERATIVE_AI_API_KEY=$gemini
AI_PRIMARY_MODEL=openai/gpt-oss-20b
AI_FALLBACK_MODEL=gemini-3.5-flash-lite
STRIPE_SECRET_KEY=$stripeSecret
STRIPE_PRICE_PRO_MONTHLY=$price
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=$cron
EMAIL_FROM=Conformly <onboarding@resend.dev>
"@ | Out-File -FilePath ".env.local" -Encoding utf8

Write-Host "Running database migrations against the direct URL..."
$env:DATABASE_URL = $directUrl
$prevEap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
& "C:/Program Files/nodejs/pnpm.cmd" db:migrate
$ErrorActionPreference = $prevEap
Write-Host "Done. Redeploy with: vercel deploy --prod --yes"
