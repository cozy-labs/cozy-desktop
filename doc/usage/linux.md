# Cozy Drive on the GNU/Linux Desktop

## Introduction

While porting the old file synchronization client to the new Cozy stack v3, we
decided to focus on Windows and macOS because those were what most of our future
users would be using.

But lots of our early-adopters were GNU/Linux users. And we are GNU/Linux users
ourselves too. So we had to bring back GNU/Linux support at some point.

There are many GNU/Linux distributions out there, and even in the Cozy team
people use many of them. Providing quality packages for everybody can be quite
time consuming.

So we decided to start with a solution that was easy for us to set up:
[AppImage][AppImage]. Easy since it's included in electron-builder,
the tool we already use to generate the Windows and macOS apps.

User experience definitely won't be the best (it will look a lot like good old
proprietary driver install scripts). But it should at least work for most people
and give us a way to quickly start getting feedback regarding other possible
issues. And the app will auto-update the same way as the Windows or macOS ones.

We'll provide packages for major distros as soon as possible (unofficial
nightly builds for Debian and Ubuntu are already being tested internally).

## Supported distributions

A few things to know:
- The current AppImage needs a relatively recent versions of :
  - `GLIBC >= 2.32`
  - `GLIBCXX >= 3.4.21`
- The application should work with most desktop manager but is actively tested on Gnome 3
- The systray icon might only show up on some desktop managers if you use a third-party software like the TopIcons-Plus Gnome extension or libappindicator; it is up to you to install the third-party software if needed

We only support the latest version of each distribution although the app could work on older versions. The table below can be outdated.

| Distribution                              | supported | comment                                                       |
| ---                                       | ---       | ---                                                           |
| Fedora 38                                 | yes       |                                                               |
| Debian 12 (Bookworm)                      | yes       |                                                               |
| Ubuntu 23.04 (Lunar Lobster)              | yes       |                                                               |
| Linux Mint 21.2 (Victoria)                | yes       |                                                               |
| Archlinux                                 | yes       | if up-to-date                                                 |
| Add your distribution (see below)         | ...       |                                                               |
| ---                                       | ---       | ---                                                           |
| Fedora 37                                 | no        | should work                                                   |
| Debian 11 (Bullseye)                      | no        | should work                                                   |
| Ubuntu 22.10 (Kinetic Kudu)               | no        | should work                                                   |
| Ubuntu 22.04 (Jammy Jellyfish)            | no        | should work after installing FUSE (`sudo apt install libfuse2`) |
| Linux Mint 21.1 (Vera)                    | no        | should work                                                   |
| Mageia 8                                  | no        | should work                                                   |
| openSUSE Leap 15.4                        | no        | should work                                                   |

**Before** requesting for your distribution to be added to the list, please:

- Include the exact name and version of your distribution
- Retrieve your *GLIBC* and *GLIBCXX*  versions by running the following commands in a
  terminal:
  - `strings $(locate -b '\libstdc++.so.6') | grep '^GLIBCXX_[0-9.]*$' | sort -V | tail -n 1`
  - `strings $(locate -b '\libstdc++.so.6') | grep '^GLIBC_[0-9.]*$' | sort -V | tail -n 1`
  (and include the output in your request)
- Install the app, run it and make sure it actually works

> **If your distribution is not supported**
> follow [the manual build guide][Build] and jump to the second part of the
> [Install](#Install) section.

## Install

> **Note for Archlinux Users**
>
> You can install `cozy-desktop` from the [community] repo.

1. Download the `*.AppImage` file for your architecture from the
   [latest release][Latest].
2. You probably don't want to keep the app in your `/Downloads` folder and run
   it from there. You can for example create a macOS-like `Applications` folder
   and move it there. Advanced users may prefer to move it to some special
   folder (`~/.local/bin/`, `~/bin/`, `/opt/`...).

### Integration with the system

By default, the application will only be launchable by double-clicking the
AppImage file you downloaded. If you want it to be available in your
applications menu, you can install the *appimaged* daemon, available from its
[github repository][appimaged]'s releases or via
your distribution package manager.
If you install it from the repository, you might need to run the following
commands in a terminal to make sure it is run when starting your user session:
```bash
$ systemctl --user add-wants default.target appimaged
$ systemctl --user start appimaged
# restart your user session now
```

After that, **any** AppImage file found in one of those folders will be
automatically made executable and available in your applications menu:
- `$HOME/Downloads` (or its localized equivalent, as determined by
  `G_USER_DIRECTORY_DOWNLOAD` in glib)
- `$HOME/.local/bin`
- `$HOME/bin`
- `$HOME/Applications`
- `/Applications`
- `[any mounted partition]/Applications`
- `/opt`
- `/usr/local/bin`

## Running

If you have decided not to integrate AppImages with your system, you'll need to
make the file executable. In GNOME 3, right-click on the file, select the
*Properties* menu entry, go to the *Permissions* tab and enable the *Execution*
checkbox. Or in a terminal:
```bash
cd /dir/where/you/put/the/file && chmod +x *.AppImage`
```

On first run, the application should have configured itself to run automatically
on system start.

## Where are the application files?

Almost everything is in the `*.AppImage` file however, if you have installed
`appimaged`, the following additional files are created:

- Launcher file in `~/.local/share/applications/appimagekit_<unique identifier>-Cozy_Drive.desktop`
- Icons in `~/.local/share/icons/hicolor/*/apps/appimagekit<same unique identifier>-cozydrive.png`

Everything else works the same as Windows or macOS: your synchronized files are
in `~/Cozy Drive/` or the folder you choose on first run, and the hidden
`~/.cozy-desktop/` folder contains the application configuration, metadata and
logs.

## Displaying the app window

To show the application preferences and the recently synchronized files list, you
can either launch the app again (i.e. it will simply open the app's window as
only one instance can run at a time) or click on the systray icon.
If `libappindicator` is installed on your system, left-clicks won't have any
effects so you need to do a right-click on the icon then select the
*Show Application* menu entry.

> **Note for GNOME Users**
>
> From 3.26 onwards, GNOME removed the systray which is the only interface for
> *Cozy Drive*. It should be replaced in the future by `libcloudprovider`, which
> we will implement when it spreads. In the meantime, you need to install an
> extension providing support for appindicator. You can find and install one
> from https://extensions.gnome.org/ by searching for `appindicator`.

> **Note for i3wm Users**
>
> You can set `"gui": {"visibleOnBlur": true}` in your
> `~/.cozy-desktop/config.json` so the popover doesn't hide when focusing
> another window.

## Uninstall

Manually remove the files listed above.

[AppImage]: https://appimage.org/
[appimaged]: https://github.com/AppImage/appimaged
[Build]: ./build.md
[Edit]: https://github.com/cozy-labs/cozy-desktop/edit/master/doc/usage/linux.md
[Latest]: https://github.com/cozy-labs/cozy-desktop/releases/latest
[TopIcons]: https://extensions.gnome.org/extension/495/topicons/
[TopIconsPlus]: https://extensions.gnome.org/extension/1031/topicons/
