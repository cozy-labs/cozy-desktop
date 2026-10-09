[OutputType([Void])]
Param(
  [Parameter(Mandatory)]
  [String]
  $FilePath,

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

# XXX: `smctl sign verify` skips the file extensions it does not know
# about (e.g. `.node` files, see sign.ps1), so signtool is called
# directly: it verifies any Windows PE image, whatever its extension.
& "$SignToolDir\signtool.exe" verify /pa "$FilePath"

# Propagate the exit code of signtool to the caller: pwsh does not do it
# automatically, which used to hide verification failures from the build.
exit $LASTEXITCODE
