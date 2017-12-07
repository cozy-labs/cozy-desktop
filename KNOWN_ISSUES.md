# Known Issues

Please report any other issue you may encounter by using the app help form.

## Synchronization

**Known issues** that should be fixed in upcoming releases:

* Trashing, restoring and deleting content permanently may not work as expected
  yet, especially regarding shared folders and connectors.
  [details](https://trello.com/c/6jfO4hoB)
* Moving or renaming multiple files or directories successively may end up
  with duplicate content or files in the Cozy / OS trash.
  [details](https://trello.com/c/ZTD669wz)
* Changing only the case or encoding in a file or directory name, e.g. renaming
  *my stuff* to *MY STUFF*, won't be synchronized on other devices.
  [details](https://trello.com/c/Phc3lLEr)

**Issues** caused by lower-level bugs that will be **harder to fix or circumvent**:

* Replacing a directory with a file of the same name won't work (same when
  replacing a file with a directory of the same name).
  [details](https://trello.com/c/rBQ2XXwp)
* When moving 2 directories at the same time on Windows, possibly only 1 move
  may be detected. [details](https://trello.com/c/X3QMUQO3)


## Performances & resources consumption

* The app takes some time before actually syncing, may hold on until
  there is no more activity, and uses a lot of CPU on start and when syncing.
  [details](https://trello.com/c/IQEImXQF)
* Actions involving lots of content may take too much time to complete or use
  too much resources. But adding 100000 files or moving 50000 files should
  still work. [details](https://trello.com/c/IQEImXQF)

## macOS integration

* The systray icon/menu doesn't behave exactly the same as native ones: missing
  background color when selected, clicking on nearby icon doesn't hide the
  popover...
* Right-click menu doesn't work, so there is no obvious way to quit
  (workaround: you can show the help form and then quit via menu or Cmd+Q).
* Clicking on the systray icon may bring you to the last *space* were it was
  open.
* The popover is still moveable with tools like BetterTouchTools.
* When opening the local synced folder, the Finder windows shows up in the
  background.

## GNU/Linux integration

* The icon is broken with alt+tab or in the GNOME 3 application menu.
* The app takes far more time to start.
* Without an extension like TopIcons-Plus on GNOME 3, the systray icon is not
  visible, leaving no other way to access the popover (since we don't bring it
  up when relaunching the app yet). It should work on other GNU/Linux desktops
  with systray support though.
* The popover is not aligned with the systray icon.
* The popover may appear on the wrong place with multiple screens.
