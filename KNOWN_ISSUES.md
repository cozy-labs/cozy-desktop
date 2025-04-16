# Known Issues

Please report any other issue you may encounter by using the app help form.

## Synchronization

**Known issues** that should be fixed in upcoming releases:

* Trashing, restoring and deleting content permanently may not work as expected
  yet, especially regarding shared folders and connectors.
  [details](https://trello.com/c/6jfO4hoB)
* Symlinks are not supported yet. Symlinks inside the synchronized directory
  will trigger errors and their content won't be synchronized.
* Using an external device mounted in a non temporary mount point as the
  synchronized directory can have unexpected consequences: in case the device is
  not mounted when the client starts, the mount point will appear as an empty
  directory and the client will assume you deleted everything and will update
  your Twake Workplace accordingly, putting everything in the Twake Drive trash.
* Using two clients on two different OS with a shared partition between the two
  is not supported.
* When a file is made executable / non-executable on the Twake Workplace side
  (i.e. typically from another device), the local file permissions are set to
  755 / 644, which means they could be more accessible than they were before
  for group / others.
* Loses the original creation date of the files and applies the sync date as the creation date instead.

**Issues** caused by lower-level bugs that will be **harder to fix or circumvent**:

* Replacing a directory with a file of the same name won't work (same when
  replacing a file with a directory of the same name).
* Files and directories at the root of the synchronized directory (usually
  `Twake`) and whose name start with an underscore (i.e. `_`), won't be
  synchronized at all.
* While having some errors, client might display "offline" message instead of relevant one.
* With some specific successive actions, moving a parent folder and editing a child file, or removing it, some changes might not be taken into account.
* On MacOS, Files in directories whose name start or end with a space won't be synchronized although the directories themselves will be.

## Performances & resources consumption

* The app uses a lot of CPU on start and when syncing.
* Actions involving lots of content may take too much time to complete or use
  too much resources. But adding 100000 files or moving 50000 files should
  still work.
* Logs can grow up a lot. We want to reduce the default verbosity, but it
  currently helps us a lot with synchronization issues.

## UI issues

* The *Start Twake Desktop on system startup* switch in the app settings may not
  reflect the actual configuration. This is an UI bug, the app should still be
  effectively started on boot.

## Windows specific issues

* In case the app shows a white window, this *may* have something to do with the
  GPU settings. See [related electron issue](https://github.com/electron/electron/issues/4380).

## macOS integration

* The app takes some time before actually syncing, may hold on until
  there is no more activity.
* The systray icon/menu doesn't behave exactly the same as native ones: missing
  background color when selected, clicking on nearby icon doesn't hide the
  popover...
* Right-click menu doesn't work, the only way to quit is through the popover,
  in the settings tab.
* The popover is still moveable with tools like BetterTouchTools.

## GNU/Linux integration

* If the `*.AppImage` file is moved after first run, then the desktop shortcut
  will always launch the old app version, even after auto-updating
  (**workaround**: install the *appimaged* daemon as explained in the
  [linux install doc](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/linux.md#install)).
* When using the `*.AppImage`, after an update, the automatic launch on system
  startup might need to be reactivated.
* Without an extension like TopIcons-Plus on GNOME 3, the systray icon is not
  visible, leaving no other way to access the popover (since we don't bring it
  up when relaunching the app yet). It should work on other GNU/Linux desktops
  with systray support though.
* On recent distro releases, the app may not show up on click with
  TopIcons-Plus. Switching back to the original TopIcons extension may fix the
  issue.
* Sometimes the systray icon is not visible on Debian Jessie, although the
  popover still works. Please fill separate issues for other distros.
  [details](https://github.com/cozy-labs/cozy-desktop/issues/422)
* The popover is not aligned with the systray icon.
* The popover may appear on the wrong place with multiple screens.
* The auto-hiding of the popover makes it almost unusable with tiling window
  managers. [details](https://github.com/cozy-labs/cozy-desktop/issues/892)
