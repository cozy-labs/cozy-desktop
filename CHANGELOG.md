## 3.4.1 - 2017-01-09

See [3.4.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.1-beta.1)
and [3.4.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.1-beta.2)
release notes.

Happy syncing!

## 3.4.1-beta.2 - 2017-01-09

Improvements for all users:

* Fix weird packaging issue ([detail](https://trello.com/c/QAOsWBCx))

Known issue for GNU/Linux users:

* The systray icon may appear twice (with only one icon actually working).
  Workaround: quit and restart. This should not happen on subsequent updates.

Happy syncing!

## 3.4.1-beta.1 - 2017-12-26

Improvements for all users:

* Deleting the synchronization folder will not trash all files on the cozy.

Changes for technical users (contributors, packagers, CLI users):

* Builds are now made in CI, which will allow us to quickly send patched versions for specific issues before they make it to the master, as well as quicker testing, so hopefully quicker releases.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.0 - 2017-12-19

Improvements for all users:

* The new quit button now appears busy once clicked.
* We added a missing french translation for the new message showing when
  selecting your whole system or personal folder to be synced.

Changes for technical users (contributors, packagers, CLI users):

* We moved to a new flat repository layout: single npm package, single runtime
  (electron), single node version (the electron one). This is a first step to
  make development easier and faster. The CLI & code coverage support are
  temporarily disabled. We should bring them back at some point, although the
  CLI will probably depend on the electron runtime for now.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.0-beta.2 - 2017-12-14

Improvements for GNU/Linux users:

* Auto-update works!
* Auto-launch on system startup too!
* The application should now be visible as expected on alt+tab.

Improvements for all users:

* Invalid cozy address detection was improved, including automatic detection of
  `mycoSy.cloud` with an `s` instead of `mycoZy.cloud` with a `z` (which seems
  to be a common mistake).
* The app also detects and prevent synchronizing your whole system or personal
  folder.
* Auto-update should be more reliable.
* The settings tab includes a new *quit* button.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.0-beta.1 - 2017-12-08

Improvements for GNU/Linux users:

* **First GNU/Linux release!**
* Download the `*.AppImage` file, move it wherever you want, make it executable
  and run it. See [details](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/linux.md).
* Since GNOME 3 doesn't have a systray anymore by default, you may need to
  install some third-party extension (e.g. TopIcons-Plus). See the
  [dedicated section](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md#gnulinux-integration)
  for remaining GNU/Linux integration issues.

Improvements for macOS users:

* The previous 3.3.1 fix regarding application visibility only worked when you
  had not pinned the Cozy Drive application in the dock.
  This should always work from now. See the
  [dedicated section](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md#macos-integration)
  for remaining macOS integration issues.

Improvements for all users:

* We upgraded a major third-party component of the application, which may fix
  a few bugs related to the user interface (including the application hanging
  when started multiple times).

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.3.1 - 2017-11-30

Improvements for all users:

* The Cozy Drive app now tries to automatically detect and use any configured
  proxy (including authentication, i.e. Kerberos authentication shoud
  *just work*).
  We also added a few command-line options and environment variables to force
  the configuration as needed:
  - `--proxy-script path/to/your/script.pac` or
    `COZY_DRIVE_PROXY_SCRIPT=path/to/your/script.pac`
  - `--proxy-ntlm-domains '*example.com,*foobar.com,*baz'` or
    `COZY_DRIVE_PROXY_NTLM_DOMAINS='*example.com,*foobar.com,*baz'` to specify
    servers for which integrated authentication is enabled (use `'*'` for all
    servers).
  - `--login-by-realm 'realm1:login1:password1,realm2:login2:password2'` or
    `COZY_DRIVE_LOGIN_BY_REALM='realm1:login1:password1,realm2:login2:password2'`
    to pass credentials manually.
  - `--proxy-rules`, `--proxy-bypassrules`, `COZY_DRIVE_PROXY_RULES` and
    `COZY_DRIVE_PROXYBYPASSRULES` for specifying which proxy should be used in
    which case (see [details](https://github.com/electron/electron/blob/master/docs/api/session.md#sessetproxyconfig-callback)).
  Please tell us in case you still can't run the Cozy Drive app behind you
  proxy so we can support as many configurations as possible.
* We also fixed an edge case where simultaneous moves ended up with files in the
  Cozy / OS trash. Expect a few more fixes very soon.

Improvements for macOS users:

* The app is not visible anymore in the dock and with `Cmd+Tab` when running in
  the background or showing the popover from the systray. It now behaves more
  like other systray-running apps. Also expect a few more fixes regarding
  systray integration.

Happy syncing!

## 3.3.0 - 2017-11-24

Improvements for all users:

* Some miscellaneous style and translations fixes

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.3.0-beta.1 - 2017-11-23

Improvements for all users:

* **Updates will now be detected automatically when starting Cozy Drive**.
  When an update is available, a splash screen will ask you to wait while
  downloading (including the download progress on Windows only) and the app
  will restart automatically. When no update is available, the app will start
  as usual. Since the update check is quite fast, we decided to display a
  splash screen only during download, not while checking. In case of network
  issues, the app may take more time to start than usual, but it should still
  work.
* **New revamped UI**: the dashboard window was replaced with a popover showing
  up next to the (new) system tray icon. The synchronization status on top of
  the popover should give you more indications about what is actually occurring
  in the background. Navigation was simplified and moved to the top of the
  popover and the help form now shows up in its own separate window.
* **Disconnecting the device from the Cozy or the app** should work as expected
  now. Also since most people encountering issues were trying to reconfigure
  their device, we made sure logs were not deleted anymore in the process.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.2.0-beta.2 - 2017-11-13

Improvements for all users:

* The synchronization now detects when remote files or directories were already
  deleted. [details](https://trello.com/c/wYoxynqg)
* The remote Cozy overloading guard was disabled so the app doesn't hold on in
  case of synchronization errors. An improved version will be reenabled later.
  [details](https://trello.com/c/SSi06JwO)
* The authorization screen should not be bigger than screen anymore.
  [details](https://trello.com/c/YrwWv2mm)
* Changing only case or encoding in a file or directory name won't trigger
  conflicts on other devices anymore. The case or encoding won't be synced
  though. We'll come up with a better solution at some point.
  [details](https://trello.com/c/krk8ZY9V)

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.2.0-beta.1 - 2017-11-09

It took us some time, but we're almost there, finally!

Improvements for all users:

* Moving or renaming shared directories should not break the sharing anymore.
* Moving or renaming connector directories should work as expected (the
  connector will put upcoming documents to the new location instead of
  recreating and filling up the old one).
* Moving or renaming a directory should now be more reliable, even with
  filesystem events occurring in random order as it seems to happen from time to
  time.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.1.0 - 2017-09-08

Improvements for all users:

* Fixed the styling of the *Show more files* button in the *Dashboard* screen.
* The default content of the support request form should now be translated
  properly.

Happy syncing!

## 3.1.0-beta.1 - 2017-09-08

Hello there! Sorry for the summer delay, the team took some rest, and recently
we were quite busy working on some huge synchronization improvements, but
that's for another story. So let's get back to the current release...

Improvements for all users:

* The onboarding (the successive screens where you configure Cozy Drive for
  Desktop on first launch) now follows the new Cozy v3 design guidelines and
  wording. The other screens were mostly updated too, especially the settings
  which were merged into a single tab. In future releases, the tabs should
  move to the top and we should progressively transition to a new popover
  layout sticking to your systray, instead of the current floating window.
  Some screens will still make use of a separate windows when relevant
  (e.g. the *Help* one).
* We also enlarged the Cozy login screen, the authorization screen (were you
  allow the Cozy Drive for Desktop app to access the data in your Cozy) and
  the Dashboard screen (the one showing recent updates). In case your display
  has a small resolution, the app should not exceed the available space and
  fall back to scrolling.
* The disk space gauge should now effectively match the available space.
* The app was occasionnaly crashing on startup with a weird *db Lock* error.
  This should not happen anymore. Please shout out loud in case it still does
  for you.
* We fixed an issue that was preventing errors to be properly notified
  when sending a support request from the *Help* screen. We also made sure
  that a favorite creation failure would not block the application.
* We now have traces of failures for almost everything in the app except for
  upgrades (which unfortunately seemed to be the source of issues recently, so
  we'll probably add it too). This should help us fix issues regarding the
  onboarding step for example.
* We also added some missing translations.
* Last but not least we added the hopefully last missing checks to detect
  conflicts while trashing/deleting folders from the Cozy.

Improvements for Windows users:

* Once configured, the app now adds a favorite to Windows 7 and Windows 8.x
  explorer.
* While uploading files from a Windows device, missing folders creation was
  failing. This is fixed now.
* We changed the way we hide some special folders on Windows. We extensively
  checked it was working as usual on every supported Windows version, so this
  should not be visible in any way for you. But in case you still start seing
  some weird `.cozy-desktop` or `.system-tmp-cozy-drive` directories, please
  tell us.

Happy syncing!

## 3.0.1 - 2017-07-31

Improvements for all users:

* When creating folders and uploading files on the remote Cozy, sometimes the
  parent folder doesn't exist yet. This case didn't occur before the 3.0.0
  release and it didn't happen during the release testing, so we were not
  handling it correctly. The issue is fixed now. We apologize for the
  inconvenience.

Happy syncing!

## 3.0.0 - 2017-07-31

Improvements for all users:

* We improved support for unicode filenames for files already in your synchronization folder before starting cozy-drive
* Moved folders on your computer does not fill your cozy's trash.
* We fixed an issue preventing conflict resolution for a folder trashed on one side while content was added on the other side

Improvements for Windows users:

* When you first register your computer on the Cozy, the app will add your Cozy Drive folder to the Windows Explorer sidebar
* Both the installer and the application should now work on 32-bit Windows.

Happy syncing!

## 3.0.0-beta.6 - 2017-07-11

Improvements for Windows users:

* The Windows 10 cloud storage registration was disabled because it was not
  stable enough yet. This means you won't get the `Cozy Drive` shortcut in
  the Windows Explorer sidebar, near the OneDrive one. We'll come up with
  another solution, possibly compatible with older Windows releases.
  Please contact us in case you get stuck with broken shortcut(s) in your
  sidebar, we'll help you to fix it. We apologize for the inconvenience.

Happy syncing!

## 3.0.0-beta.5 - 2017-07-10

Improvements for all users:

* **The application was renamed to Cozy Drive!**
* Deleted files and folders on Cozy are now correctly synchronized on your
  computer.
* An infinite synchronization issue between multiple devices was fixed.
* Network load is now smaller when retrieving changes from the remote Cozy.
* Most useless copies of folders should not end up in the Windows recycle bin,
  the macOS trash or the Cozy trash anymore. Some issues remain though.
* Useless conflicts for trashed files/folders won't happen anymore (this was
  only visible in logs).
* Documentation was updated.
* Some typos in the french locale were fixed.
* We started adding more automated tests to prevent regressions and ensure a
  better quality for future releases.

## 3.0.0-beta.4 - 2017-06-12

Improvements for Windows 10 users:

* When you first register your computer on the Cozy, the app will add your
  Cozy Drive folder to the Windows Explorer sidebar (near the OneDrive one).
  If you disconnect from the settings, the sidebar shortcut will be removed.

Improvements for macOS users:

* When you first register your computer on the Cozy, the app will add your
  Cozy Drive folder to the Finder favorites. It will still have a normal
  folder icon though (same as the real folder).
  Also the favorite will not be removed when you disconnect. You can still
  easily remove it by hand.
  These small details should be fixed soon.
* The app will synchronize macOS folders without their custom icons (those
  are stored in hidden files with weird character in their name, which is
  not supported by the Cozy at the moment, and was triggering synchronization
  errors).

Improvements for all users:

* The temporary .cozy-desktop folder inside your Cozy Drive one was renamed
  to .system-tmp-cozy-desktop, to make sure even people displaying hidden
  files in their file browser won't try to put files in it and expect them
  to be synchronized.
* Logging improvements (for debugging purpose)

Happy syncing!

## 3.0.0-beta.3 - 2017-06-02

This is for testing purpose only.
Do not install it, unless you know what you're doing.

Improvements for all users:

* You can now request support directly from the application.
* On the onboarding screen, you'll be warned in case you typed your email
  address instead of the address of your Cozy.
* The app will now start by default on login. You can still disable it in the
  settings.
* The activity indicator is now visible on deletions.
* Links are now opened in a new windows, so users don't end up with no way to
  get back.
* The content of a folder renamed offline will not be uploaded again.
* When a file was both updated locally and trashed remotely, it will be kept
  with the updated content.
* The app now enforces MD5Sum for all files, to ensure data consistency and to
  prevent weird issues.
* Disk space and revocation error messages should be clearer.
* Logs are easier to filter, which should help us to debug synchronization
  issues.

Improvements for Windows users:

* You should not see weird `.cozy-desktop` directories anymore (including in
  your home and your `Cozy Drive` directories).
* Fixed an issue with last modification date, which was preventing a file first
  uploaded through the Cozy Drive web app, then renamed locally, to be synced.

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
