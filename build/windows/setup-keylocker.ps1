try {
  $whoami = $MyInvocation.MyCommand

  # Verify that all required environment variables are set
  $required = @(
    'SM_API_KEY',
    'SM_KEYPAIR_ALIAS',
    'SM_CERTIFICATE_FINGERPRINT',
    'SM_CLIENT_CERT_FILE_B64',
    'SM_CLIENT_CERT_FILE',
    'SM_CLIENT_CERT_PASSWORD',
    'SM_HOST',
    'SM_TOOLS_URI',
    'SM_INSTALL_DIR',
    'SIGNTOOL_DIR'
  )
  foreach ($variable in $required) {
    if (!$(Test-Path "env:$variable")) {
      throw "Unable to sign files because $variable is not set in the environment."
    }
  }

  # Download SM Tools
  Write-Host "[$whoami] Downloading SM Tools..."
  $params = @{
    Method  = 'Get'
    Headers = @{
      'x-api-key' = $env:SM_API_KEY
    }
    Uri     = $env:SM_TOOLS_URI
    OutFile = 'smtools.msi'
  }
  Invoke-WebRequest @params

  # Install SM Tools
  Write-Host "[$whoami] Installing SM Tools..."
  msiexec.exe /i smtools.msi /quiet /qn | Wait-Process

  # Decode client certificate
  Write-Host "[$whoami] Creating certificate file holder..."
  New-Item C:\Certificate.p12.b64
  Write-Host "[$whoami] Setting certificate file content..."
  Set-Content -Path "${env:SM_CLIENT_CERT_FILE}.b64" -Value $env:SM_CLIENT_CERT_FILE_B64
  Write-Host "[$whoami] Decoding certificate file content..."
  certutil -decode "${env:SM_CLIENT_CERT_FILE}.b64" $env:SM_CLIENT_CERT_FILE

  # Get the smctl.exe executable
  $smctl = "${env:SM_INSTALL_DIR}\smctl.exe"

  # XXX: Uncomment to debug tools installation
  # Write-Host "[$whoami] Verifying SM Tools install..."
  # & "$smctl" healthcheck --all

  # Sync certificate
  Write-Host "[$whoami] Synchronizing certificate..."
  & "$smctl" windows certsync --keypair-alias="${env:SM_KEYPAIR_ALIAS}"
} catch {
  throw $PSItem
}
