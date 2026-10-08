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

# XXX: Force signtool: smctl selects the signing tool based on the file
# extension and silently ignores the ones it does not know (e.g. `.node`
# files), printing "There were no files found for signing" and exiting
# with code 0.
& "$smctl" sign --input="$FilePath" --keypair-alias="$KeyPairAlias" --tool=signtool --verbose

# Propagate the exit code of smctl to the caller: pwsh does not do it
# automatically, which used to hide signing failures from the build.
exit $LASTEXITCODE
