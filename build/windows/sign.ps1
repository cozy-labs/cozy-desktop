[OutputType([Void])]
Param(
  [Parameter(Mandatory)]
  [String]
  $FilePath,

  [Parameter(Mandatory)]
  [String]
  $KeyPairAlias,

  [Parameter(Mandatory)]
  [String]
  $SmctlDir,

  [Parameter(Mandatory)]
  [String]
  $SignToolDir
)

# Set the path
$env:Path = @(
  [System.Environment]::GetEnvironmentVariable('Path', 'Machine'),
  [System.Environment]::GetEnvironmentVariable('Path', 'User'),
  $SignToolDir
) -join ';'

# Get the smctl.exe executable
$smctl = "$SmctlDir\smctl.exe"

# XXX: smctl only signs the file types it knows about: it selects the
# signing tool based on the file extension and silently ignores the other
# ones, exiting with code 0 ("There were no files found for signing"),
# even with `--tool=signtool` which only filters the known types. `.node`
# files are Windows PE images just like `.dll` files though, so they are
# signed under a temporary `.dll` name and moved back once signed.
$target = $FilePath
if ([System.IO.Path]::GetExtension($FilePath).ToLowerInvariant() -eq '.node') {
  $target = Join-Path ([System.IO.Path]::GetTempPath()) ("{0}.dll" -f [Guid]::NewGuid())
  Copy-Item -Path $FilePath -Destination $target
}

& "$smctl" sign --input="$target" --keypair-alias="$KeyPairAlias" --tool=signtool --verbose
$exitCode = $LASTEXITCODE

if ($target -ne $FilePath) {
  if ($exitCode -eq 0) {
    Move-Item -Path $target -Destination $FilePath -Force
  } else {
    Remove-Item -Path $target
  }
}

# Propagate the exit code of smctl to the caller: pwsh does not do it
# automatically, which used to hide signing failures from the build.
exit $exitCode
