param()

$configDir = Join-Path $env:USERPROFILE '.config\ima'
$apiKey = Read-Host 'Paste your own ima API Key (input is hidden) ' -AsSecureString
$clientId = Read-Host 'Paste your own ima Client ID (input is hidden) ' -AsSecureString

function ConvertToPlainText([Security.SecureString]$value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$plainApiKey = ConvertToPlainText $apiKey
$plainClientId = ConvertToPlainText $clientId
if ([string]::IsNullOrWhiteSpace($plainApiKey) -or [string]::IsNullOrWhiteSpace($plainClientId)) {
  throw 'API Key and Client ID must both be supplied.'
}

New-Item -ItemType Directory -Path $configDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $configDir 'api_key') -Value $plainApiKey -NoNewline -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $configDir 'client_id') -Value $plainClientId -NoNewline -Encoding utf8NoBOM
Write-Output 'Saved local ima credentials. No credential values were displayed.'
