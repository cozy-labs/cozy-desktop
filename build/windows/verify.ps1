[OutputType([Void])]
Param(
  [Parameter(Mandatory)]
  [String]
  $FilePath,

  [Parameter(Mandatory)]
  [String]
  $Fingerprint,

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

# XXX: Force signtool for the same reason as in sign.ps1: smctl would
# otherwise skip unknown extensions (e.g. `.node`) and report success.
& "$smctl" sign verify --input="$FilePath" --fingerprint="$Fingerprint" --tool=signtool

# Propagate the exit code of smctl to the caller: pwsh does not do it
# automatically, which used to hide verification failures from the build.
exit $LASTEXITCODE
