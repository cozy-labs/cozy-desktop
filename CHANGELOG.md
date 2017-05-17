## 3.0.0-beta.2 - 2017-05-17

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all platforms:

* When an update was available, the app used to display the version number and
  the release notes in the Settings. This was broken while migrating to the new
  auto-update system. The issue is partially fixed, but it only shows the
  summary instead of the full release notes for now.
* The auto-update migration also revealed another issue: the app was checking
  for updates every 1 or 2 minutes, triggering successive downloads of the
  latest release. This should work as expected now.

Improvements for Windows users:

* The app was not downloading updates from the appropriate location on Windows
  (while it was working on other platforms). This was fixed too.

Happy syncing!

## 3.0.0-beta.1 - 2017-05-15

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all platforms:

* A beta release! Although some cases remain where synchronization breaks, it
  mostly works on all 3 platforms. Please report every issue!
* Switching to beta was good timing to change the version number format, which
  should finally fix the last auto-updates issue.
* The app will detect and prevent synchronization of files/folders with
  paths/names too long for your system, so you never end up with unusable
  content on your hard drive.
* When starting Cozy Desktop, it will detect an already running instance of the
  app, make it visible and exit (instead of displaying a weird error message).

Improvements for Windows users:

* The app now detects and displays using the user language.

Happy syncing!

## 3.0.0-alpha5 - 2017-05-11

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all platforms:

* A new auto-updates system which should work better on both Windows and macOS
* Fixed an issue preventing a locally renamed file to be updated on the remote
  Cozy

Improvements for Windows users:

* The weird animation that was displayed while installing the app since the
  alpha4 release should be replaced with a normal install dialog.

Finally, we would like to apologize to our Windows users, since auto-updates
actually didn't work in the alpha4 release. This should be fixed now. Thanks
for your patience.

Happy syncing!

## 3.0.0-alpha4 - 2017-05-09

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all platforms:

* Files are now synchronized to your *Cozy Drive* folder (to better match the
  *Cozy Drive* app name). If your already had a *Cozy* folder set up,
  *Cozy Desktop* will continue to use it. If you want to switch to the new
  folder, you can disconnect from your Cozy in the Settings, rename your local
  *Cozy* folder to *Cozy Drive* (so you don't need to download everything
  again), then restart *Cozy Desktop*, register and use the new folder.
* Your computer now appears in your Cozy as *Cozy Drive (your computer name)*.

Improvements for Windows users:

* Installer and app are signed now, which should prevent warnings and allow
  us to support automatic updates. Since we use a standard certificate (not
  one with Extended Validation), you'll still get a confirmation popup at
  install time, until the app gets enough reputation in Microsoft SmartScreen
  (the anti-phishing system included in Windows 8 and later).
* This release (and upcoming ones) should now support automatic updates. But
  previous releases didn't, so you'll still have to download and install this
  one by hand.
* A third-party component used by *Cozy Desktop* to monitor your local folder
  was updated, fixing some issues on Windows.

Happy syncing!

## 3.0.0-alpha3 - 2017-05-05

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all platforms:

* Restoring a folder from the Cozy trash is now supported.
* We fixed some conflict resolution issues. Creating / changing / restoring
  files with the same name should be more reliable now. Some issues remain,
  though.
* Most offline actions should work now, except for deletions.

Improvements for Windows users:

* A release! Getting a code signing certificate took more time than expected,
  though, so the app is not signed yet. This should be fixed in the next one.
* Windows file/dir paths are now supported, making the synchronization usable,
  hence the release.
* Files and folders with reserved name, reserved characters or terminating
  characters will not be synchronized locally and user will be warned.

Improvements for macOS users:

* The dock icon is now hidden when closing the Cozy Desktop window, so you
  don't see it with cmd-tab when running in background
* Files and folders with colon in their name will not be synchronized locally
  and user will be warned of this character as being reserved on macOS

## 3.0.0-alpha2 - 2017-04-24

This is for testing purpose only.
Do not install it, unless you know what you're doing.

* Improve macOS packaging
* Improve conflict management
* Improve error management
* Improve log report
* Improve Windows support


## 3.0.0-alpha1 - 2017-04-14

This is for testing purpose only.
Do not install it, unless you know what you're doing.
Please note that future releases will only support the new Cozy stack v3.

## Previous releases

* Proof of concept
