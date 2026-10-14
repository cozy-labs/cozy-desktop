[OutputType([Void])]

# Fails the build when the certificate that signed the installer does not
# match the `publisherName` list of electron-builder-config.js: electron-
# updater performs the same check on the client at update time, so a drift
# would block every already installed app from auto-updating.
#
# Failures are thrown (not exited): AppVeyor fails a pwsh step on an
# uncaught exception but not on a non-zero exit code.

$installer = Get-Item -Path "dist\Twake*Desktop*Setup*.exe" |
  Select-Object -First 1
if ($null -eq $installer) {
  throw "No installer found in dist\ matching Twake*Desktop*Setup*.exe"
}

$signature = Get-AuthenticodeSignature -FilePath $installer.FullName
if ($signature.Status -ne "Valid") {
  throw (
    "Installer $($installer.Name) is not validly signed: " +
    "$($signature.Status) - $($signature.StatusMessage)"
  )
}

# The comparison itself runs in Node (same semantics as electron-updater) so
# it is unit-tested and lintable; this script only extracts the subject.
node build\windows\verify-publisher.js "$($signature.SignerCertificate.Subject)"
if ($LASTEXITCODE -ne 0) {
  throw "Publisher verification failed for $($installer.Name) (see output above)"
}
