# Verify that every executable file of the packaged app (.exe, .dll, .node) is
# signed. Windows Smart App Control blocks unsigned binaries when loading them
# (e.g. the native modules unpacked from the asar archive), which crashes the
# app at startup.
Param(
  [Parameter(Mandatory)]
  [String]
  $Directory
)

$peExtensions = @('.exe', '.dll', '.node')

$unsigned = Get-ChildItem -Path $Directory -Recurse -File |
  Where-Object { $peExtensions -contains $_.Extension.ToLowerInvariant() } |
  ForEach-Object {
    $signature = Get-AuthenticodeSignature -FilePath $_.FullName
    if ($signature.Status -ne 'Valid') {
      $_.FullName
    }
  }

if ($unsigned) {
  throw "The following files are not properly signed:`n$($unsigned -join "`n")"
}
