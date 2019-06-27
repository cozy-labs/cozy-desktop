# Cozy Drive on macOS

## Supported versions

| macOS version | supported | comment |
| --- | --- | --- |
| 10.13 "High Sierra" | yes | actively tested |
| 10.12 "Sierra" | yes | actively tested |
| 10.11 "El Capitan" | | should work |
| 10.10 "Yosemite" | | should work |
| 10.9 "Mavericks" | | should work |
| 10.8 "Mountain Lion" | no | |
| 10.7 "Lion" | no | |
| 10.6 "Snow Leopard" | no | |

## Slash (`/`) vs colon (`:`) on macOS

Quoting [this paper][SANCHEZ_USENIX_2000] from Wilfredo Sánchez, senior
software engineer at Apple :

> Another obvious problem is the different path separators between HFS+
> (colon, ':') and UFS (slash, '/'). This also means that HFS+ file names may
> contain the slash character and not colons, while the opposite is true for
> UFS file names. This was easy to address, though it involves transforming
> strings back and forth. The HFS+ implementation in the kernel's VFS layer
> converts colon to slash and vice versa when reading from and writing to the
> on-disk format. So on disk the separator is a colon, but at the VFS layer
> (and therefore anything above it and the kernel, such as libc) it's a slash.
> However, the traditional Mac OS toolkits expect colons, so above the BSD
> layer, the core Carbon toolkit does yet another translation. The result is
> that Carbon applications see colons, and everyone else sees slashes. This
> can create a user-visible schizophrenia in the rare cases of file names
> containing colon characters, which appear to Carbon applications as slash
> characters, but to BSD programs and Cocoa applications as colons.

[SANCHEZ_USENIX_2000]: http://www.wsanchez.net/papers/USENIX_2000/
