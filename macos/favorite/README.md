# Adding the sync folder to the Finder's favorite items on macOS

Apple removed the `sfltool add-item` subcommand in macOS 10.13 (High Sierra):
https://openradar.appspot.com/35722438
We were using it to add the sync folder to the Finder's favorite items on
previous macOS releases.

The `sfltool` CLI is actually a frontend to the `sharedfilelistd` XPC service.
The latter reads/writes from plist files (e.g. `~/Library/Application\ Support/com.apple.sharedfilelist`).

Writing directly to those files didn't sound like a good idea since:

- It could conflict with the running service (maybe).
- Plist files sometimes contain weird entries which we don't really know how
  to handle.

Talking to the XPC service directly could be a better option, but it may not
be so easy to implement (there are 2 different XPC API's, documentation is not
so easy to find, etc...).

An easier [deprecated API](https://developer.apple.com/documentation/coreservices/klssharedfilelistfavoriteitems)
exists to add favorite items.

We are temporarily using it through a Swift binary embedded into the macOS app
to add the sync dir to the Finder's favorite items.

The binary currently adds 51K + swift build dependency/step for the macOS app.
This could possibly be reduced by building the binary in release mode.

We're currently using Swift 3.1 because this is the default Travis version.
But building locally on macOS 10.13 (High Sierra) with the default Swift (4.0)
should work too.

We're [not the only ones to use the deprecated API](https://github.com/nextcloud/desktop/blob/master/src/common/utility_mac.cpp#L30),
so hopefully we should be able to find a solution when it's finally removed in
some future macOS release.
