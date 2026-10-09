# Verify that every Windows executable file of the packaged app (.exe, .dll,
# .node) is signed. Windows Smart App Control blocks unsigned binaries when
# loading them (e.g. the native modules unpacked from the asar archive), which
# crashes the app at startup. Files that are not Windows PE images (e.g. the
# `darwin`, `linux` and `android` prebuilds shipped by some native modules)
# cannot carry an Authenticode signature and are skipped.
Param(
  [Parameter(Mandatory)]
  [String]
  $Directory
)

$peExtensions = @('.exe', '.dll', '.node')

$unsigned = Get-ChildItem -Path $Directory -Recurse -File |
  Where-Object { $peExtensions -contains $_.Extension.ToLowerInvariant() } |
  Where-Object {
    # The "MZ" magic bytes mark a Windows PE image: other binaries (ELF,
    # Mach-O prebuilds) are never loaded by Windows and cannot be signed.
    $stream = [System.IO.File]::OpenRead($_.FullName)
    try {
      $magic = [byte[]]::new(2)
      $null = $stream.Read($magic, 0, 2)
      $magic[0] -eq 0x4D -and $magic[1] -eq 0x5A
    } finally {
      $stream.Dispose()
    }
  } |
  ForEach-Object {
    $signature = Get-AuthenticodeSignature -FilePath $_.FullName
    if ($signature.Status -ne 'Valid') {
      "$($_.FullName) [$($signature.Status)]"
    }
  }

if ($unsigned) {
  throw "The following files are not properly signed:`n$($unsigned -join "`n")"
}
