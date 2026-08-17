param()

$configDir = Join-Path $env:USERPROFILE '.config\ima'
$apiKeyPath = Join-Path $configDir 'api_key'
$clientIdPath = Join-Path $configDir 'client_id'
$apiKeyConfigured = (Test-Path -LiteralPath $apiKeyPath) -and ((Get-Item -LiteralPath $apiKeyPath).Length -gt 0)
$clientIdConfigured = (Test-Path -LiteralPath $clientIdPath) -and ((Get-Item -LiteralPath $clientIdPath).Length -gt 0)

[pscustomobject]@{
  clientIdConfigured = [bool]$clientIdConfigured
  apiKeyConfigured = [bool]$apiKeyConfigured
  ready = [bool]($clientIdConfigured -and $apiKeyConfigured)
  nextAction = if ($clientIdConfigured -and $apiKeyConfigured) { 'run-openapi-preflight' } else { 'configure-at-ima-agent-interface' }
} | ConvertTo-Json -Compress
