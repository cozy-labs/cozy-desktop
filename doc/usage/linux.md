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
[AppImage](https://appimage.org/). Easy since it's included in electron-builder,
the tool we already use to generate the Windows and macOS apps.

User experience definitely won't be the best (it will look a lot like good old
proprietary driver install scripts). But it should at least work for most people
and give us a way to quickly start getting feedback regarding other possible
issues. And the app will auto-update the same way as the Windows or macOS ones.

We'll provide packages for major distros as soon as possible (unofficial
nightly builds for Debian and Ubuntu are already being tested internally).

## Supported distributions

The current AppImage needs a relatively recent version of `GLIBCXX >= 3.4.21`.

| Distribution | supported | `GLIBCXX` | comment |
| --- | --- | --- | --- |
| Arch Linux | | 3.4.24 | **should work** |
| Debian 7 (Wheezy) | no | 3.4.17 | |
| Debian 8 (Jessie) | no | 3.4.20 | |
| **Debian 9 (Stretch)** | ? | 3.4.22 | **should work** |
| **Fedora 27** | **yes** | 3.4.24 | |
| Linux Mint 17.1 LTS (Rebecca) | no | | |
| Ubuntu 14.04 (Trusty Tahr) | no | 3.4.19 | |
| **Ubuntu 16.04 (Xenial Xerus)** | **yes** | 3.4.21 | some issues on Unity |
| **Ubuntu 17.10 (Artful Aardvark)** | **yes** | 3.4.24 | GNOME 3 |
| [Add your distribution](https://github.com/cozy-labs/cozy-desktop/edit/master/doc/usage/linux.md) (see below) | ... | ... | |

**Before** requesting for your distribution to be added to the list, please:

- Include the exact name and version of your distribution
- Retrieve your *GLIBCXX*  version by running the following command in a
  terminal:
  `strings $(locate -b '\libstdc++.so.6') | grep '^GLIBCXX_[0-9.]*$' | sort -V | tail -n 1`
  (and include the output in your request)
- Install the app, run it and make sure it actually works

**If your distribution is not supported,** follow [the manual build guide](./build.md)

## Install

1. Download the `*.AppImage` file for your architecture from the
   [latest release](https://github.com/cozy-labs/cozy-desktop/releases/latest).
2. You probably don't want to keep the app in your `/Downloads` folder and run
   it from there. You can for example create a macOS-like `Applications` folder
   and move it there. Advanced users may prefer to move it to some special
   folder (`~/.local/bin/`, `~/bin/`, `/opt/`...).
3. Make the file executable. In GNOME 3, right-click on the file, select the
   *Properties* menu entry, go to the *Permissions* tab and enable the
   *Execution* checkbox. Or in a terminal:
   `cd /dir/where/you/put/the/file && chmod +x *.AppImage`
4. Run the application for the first time by double-clicking it. It will add
   itself to your existing application shortcuts.

**Note for GNOME Users** : From 3.26 onwards, GNOME removed the systray which is the only interface for *Cozy Drive*. It should be replaced in the future by `libcloudprovider`, which we will implement when it spreads. In the meantime, you need to install an extension such as [TopIcons](https://extensions.gnome.org/extension/1031/topicons/)

## Running

On first run, the application should have configured itself to run automatically
on system start.

You should also see the *Cozy Drive* application with other ones in GNOME Shell
or in your applications menu (in the *utility* category).

## Where are the application files?

Almost everything is in the `*.AppImage` file. On first run, the following
additional files are created:

- Launcher file in `~/.local/share/applications/appimagekit-CozyDrive.desktop`
- Icons in `~/.local/share/icons/hicolor/*/apps/appimagekit-CozyDrive.png`

Everything else works the same as Windows or macOS: your synchronized files are
in `~/Cozy Drive/` or the folder you choose on first run, and the hidden
`~/.cozy-desktop/` folder contains the application configuration, metadata and
logs.

## Uninstall

Manually remove the files listed above.
