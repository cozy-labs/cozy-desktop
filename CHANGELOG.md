# Cozy Drive for Desktop: Changelog

## 3.36.0 - 2022-07-26

Improvements for all users:

- The Electron framework was upgraded to v19.0.0. This major version fixes a lot
  of security errors as well as other smaller errors like crashes.
- We fixed the invalid path error details window which would not show up
  anymore. We took the opportunity to improve its display and have the whole
  content fit in the window without scrollbars.

Improvements for Windows and Linux users:

- We replaced our filesystem changes surveillance library to use @parcel/watcher
  as @atom/watcher is not maintained anymore and was preventing us from
  upgrading Electron.
  Although the behavior of Cozy Desktop should remain mostly untouched, it
  should be easier to follow document movements on Windows and faster to scan
  folders, especially during an app start.

Improvements for Linux users:

- The Electron upgrade should resolve issues some users can experience with
  recent Ubuntu versions and their derivatives. Cozy Desktop should start
  without issues.
- Electron does not support 32-bit Linux binaries anymore so we stopped building
  binaries for this architecture as well.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.36.0-beta.1 - 2022-07-07

Improvements for all users:

- The Electron framework was upgraded to v19.0.0. This major version fixes a lot
  of security errors as well as other smaller errors like crashes.
- We fixed the invalid path error details window which would not show up
  anymore. We took the opportunity to improve its display and have the whole
  content fit in the window without scrollbars.

Improvements for Windows and Linux users:

- We replaced our filesystem changes surveillance library to use @parcel/watcher
  as @atom/watcher is not maintained anymore and was preventing us from
  upgrading Electron.
  Although the behavior of Cozy Desktop should remain mostly untouched, it
  should be easier to follow document movements on Windows and faster to scan
  folders, especially during an app start.

Improvements for Linux users:

- The Electron upgrade should resolve issues some users can experience with
  recent Ubuntu versions and their derivatives. Cozy Desktop should start
  without issues.
- Electron does not support 32-bit Linux binaries anymore so we stopped building
  binaries for this architecture as well.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.35.0 - 2022-05-12

Improvements for all users:

- We fixed a few issues that were preventing the correct processing of movements
  and renamings of documents that have never been synchronized and sometimes not
  even been saved in our local database.
  These should now be handled as creations at their new path and overwritten
  documents trashed on the other side.
- We've fixed yet another issue with data migrations making requests to the
  remote Cozy when the Desktop's Oauth client has been revoked on the Cozy.
  You will now be be informed of the issue and given the opportunity to
  reconnect your client.
- To prevent blocking the Desktop client to start and synchronize when an app
  update is available but downloading it consistently fail, we've decided to
  stop retrying the download after 5 failures. The client will still try to
  download the update again 24 hours later.
- We've updated the error message displayed when we fail to send a file to the
  remote Cozy because it's size is either larger than the available space or the
  maximum allowed. It should be easier to understand and the available action
  less scary.
- We've made changes to the dependency algorithm that decides which changes need
  to be synchronized first in order for all changes to be synchronized correctly
  (and without retry). When documents are moved to a freshly created directory,
  we should always synchronize the creation of said directory before moving the
  documents into it.
  This would work with retries before but this was a waste of time and
  resources.

Improvements for Windows users:

- The local database software could experience issues when trying to delete
  temporary databases or the main database when disconnecting the client.
  An update of said software should now handle them appropriately.

Improvements for macOS users:

- We fixed a few issues that were preventing the correct processing of movements
  with case changes of documents that have never been been saved in our local
  database.
  These should now be handled as creations at their new path and overwritten
  documents trashed on the other side.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.35.0-beta.2 - 2022-05-10

Improvements for all users:

- We've made changes to the dependency algorithm that decides which changes need
  to be synchronized first in order for all changes to be synchronized correctly
  (and without retry). When documents are moved to a freshly created directory,
  we should always synchronize the creation of said directory before moving the
  documents into it.
  This would work with retries before but this was a waste of time and
  resources.

Improvements for macOS users:

- We fixed a few issues that were preventing the correct processing of movements
  with case changes of documents that have never been been saved in our local
  database.
  These should now be handled as creations at their new path and overwritten
  documents trashed on the other side.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.35.0-beta.1 - 2022-05-06

Improvements for all users:

- We fixed a few issues that were preventing the correct processing of movements
  and renamings of documents that have never been synchronized and sometimes not
  even been saved in our local database.
  These should now be handled as creations at their new path and overwritten
  documents trashed on the other side.
- We've fixed yet another issue with data migrations making requests to the
  remote Cozy when the Desktop's Oauth client has been revoked on the Cozy.
  You will now be be informed of the issue and given the opportunity to
  reconnect your client.
- To prevent blocking the Desktop client to start and synchronize when an app
  update is available but downloading it consistently fail, we've decided to
  stop retrying the download after 5 failures. The client will still try to
  download the update again 24 hours later.
- We've updated the error message displayed when we fail to send a file to the
  remote Cozy because it's size is either larger than the available space or the
  maximum allowed. It should be easier to understand and the available action
  less scary.

Improvements for Windows users:

- The local database software could experience issues when trying to delete
  temporary databases or the main database when disconnecting the client.
  An update of said software should now handle them appropriately.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.34.2 - 2022-04-28

Improvements for all users:

- We fixed another issue with the latest data migration. It affected users who
  had deleted directories which were still known to the local PouchDB database.
  Missing directories will now be handled appropriately.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.34.1 - 2022-04-27

Improvements for all users:

- We fixed an issue with a data migration shipped with the previous release. It
  affected clients connected to Cozies with a large number of directories.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.34.0 - 2022-04-27

Improvements for all users:

- We fixed a bug affecting sub-directories of sub-directories of directories
  moved on the remote Cozy. These could not be updated from the local filesystem
  anymore, triggering Invalid Metadata errors when the client would try to
  synchronize the local modifications (e.g. a move).
  All directories that were affected will be fixed by a data migration upon
  restart of the client.
- Fetching new remote changes will now be faster as we've removed some network
  calls that are not necessary anymore.
- The client should create fewer conflicts on files as we've improved the
  decision logic when dealing with conflicting local and remote changes. If the
  local content can be found in one of its old versions stored on the remote
  Cozy then the client will overwrite it with the remote content instead of
  creating a conflict.
  If that decision was not the one the user expected then the overwritten
  content can still be retrieved from the remote Cozy via the file's versions.
- During the client's on-boarding process, clicking on the ToS link (or any link
  pointing to a URL ending with `.pdf`) will open the pointed URL within the
  external browser rather than the on-boarding window.
- Network errors during the synchronization of a change should not result in a
  blocked synchronization anymore.
- Network errors during a file transfer either from or to the remote Cozy will
  now be handled properly, restarting the transfer until too many errors are
  encountered and the global error handling mechanism takes over.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.34.0-beta.2 - 2022-04-22

Improvements for all users:

- During the client's on-boarding process, clicking on the ToS link (or any link
  pointing to a URL ending with `.pdf`) will open the pointed URL within the
  external browser rather than the on-boarding window.
- Network errors during the synchronization of a change should not result in a
  blocked synchronization anymore.
- Network errors during a file transfer either from or to the remote Cozy will
  now be handled properly, restarting the transfer until too many errors are
  encountered and the global error handling mechanism takes over.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.34.0-beta.1 - 2022-04-20

Improvements for all users:

- We fixed a bug affecting sub-directories of sub-directories of directories
  moved on the remote Cozy. These could not be updated from the local filesystem
  anymore, triggering Invalid Metadata errors when the client would try to
  synchronize the local modifications (e.g. a move).
  All directories that were affected will be fixed by a data migration upon
  restart of the client.
- Fetching new remote changes will now be faster as we've removed some network
  calls that are not necessary anymore.
- The client should create fewer conflicts on files as we've improved the
  decision logic when dealing with conflicting local and remote changes. If the
  local content can be found in one of its old versions stored on the remote
  Cozy then the client will overwrite it with the remote content instead of
  creating a conflict.
  If that decision was not the one the user expected then the overwritten
  content can still be retrieved from the remote Cozy via the file's versions.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0 - 2022-03-15

Improvements for all users:

- The URL validation step of the on-boarding wizard is now able to detect your
  Cozy root URL in more complex URLs (e.g. a photo album URL copied from your
  Cozy Photos app in your browser).
- When the server hosting your Cozy experiences issues, the Desktop client will
  display a specific error message instead of telling you that no internet
  connection is detected.
- Files being transferred to or from your Cozy will now be displayed in the main
  window's Recent tab with progress information.
- You will now be able to completely reinitialize your Desktop client's
  synchronization from the Settings tab without having to disconnect and then
  reconnect your remote Cozy. Your selective synchronization configuration will
  thus be kept.
- You can now open your Cozy within a Desktop window with a Ctrl-click
  (Cmd-click on macOS) on the "Open Cozy" button in the main window. You will
  have to enter your credentials the first time.
- You can now open folders in your Cozy with a Ctrl-click (Cmd-click on macOS)
  on folder paths in the Recent tab of the main window or the "Open folder"
  button.
- Paths displayed in synchronization error messages for changes coming from the
  remote Cozy will now open in Cozy Drive Web since they might not exist on the
  local filesystem and the solution probably resides in remote actions.
- Confirmation dialogs for reinitializing the synchronization and unlinking the
  remote Cozy are more homogeneous and will prevent the main window from closing
  until the requested action is confirmed or canceled.
- Sub-directories excluded from a Desktop client's synchronization and their
  content won't be fetched anymore when their parent directory is re-included.
- Old files with a creation date seemingly more recent than their last
  modification date can now be moved or renamed. Their last modification date
  will be updated in the process to match the most recent date available.
- Re-included directories that need their content to be fetched manually will be
  marked as such until their content is actually retrieved so we can resume the
  operation in case Cozy Desktop is stopped in the middle.

Improvements for macOS users:

- You should not see conflicts created anymore when a remote document whose name
  contains multiple utf-8 characters encoded with NFC and NFD norms is
  downloaded and saved on your local filesystem.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0-beta.5 - 2022-03-09

Improvements for all users:

- Old files with a creation date seemingly more recent than their last
  modification date can now be moved or renamed. Their last modification date
  will be updated in the process to match the most recent date available.
- Re-included directories that need their content to be fetched manually will be
  marked as such until their content is actually retrieved so we can resume the
  operation in case Cozy Desktop is stopped in the middle.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0-beta.4 - 2022-03-02

Improvements for macOS users:

- You should not see conflicts created anymore when a remote document whose name
  contains multiple utf-8 characters encoded with NFC and NFD norms is
  downloaded and saved on your local filesystem.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0-beta.3 - 2022-02-22

Improvements for all users:

- Localizations strings have been updated and the new empty Recent tab
  placeholder has been localized.
- Confirmation dialogs for reinitializing the synchronization and unlinking the
  remote Cozy are more homogeneous and will prevent the main window from closing
  until the requested action is confirmed or canceled.
- Sub-directories excluded from a Desktop client's synchronization and their
  content won't be fetched anymore when their parent directory is re-included.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0-beta.2 - 2022-02-18

Improvements for all users:

- You can now open your Cozy within a Desktop window with a Ctrl-click
  (Cmd-click on macOS) on the "Open Cozy" button in the main window. You will
  have to enter your credentials the first time.
- You can now open folders in your Cozy with a Ctrl-click (Cmd-click on macOS)
  on folder paths in the Recent tab of the main window or the "Open folder"
  button.
- Paths displayed in synchronization error messages for changes coming from the
  remote Cozy will now open in Cozy Drive Web since they might not exist on the
  local filesystem and the solution probably resides in remote actions.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.33.0-beta.1 - 2022-02-16

Improvements for all users:

- The URL validation step of the on-boarding wizard is now able to detect your
  Cozy root URL in more complex URLs (e.g. a photo album URL copied from your
  Cozy Photos app in your browser).
- When the server hosting your Cozy experiences issues, the Desktop client will
  display a specific error message instead of telling you that no internet
  connection is detected.
- Files being transferred to or from your Cozy will now be displayed in the main
  window's Recent tab with progress information.
- We've made some optimizations to remote content fetching so the initial
  synchronization and the retrieval of remote directories content require less
  network requests and less memory.
- You will now be able to completely reinitialize your Desktop client's
  synchronization from the Settings tab without having to disconnect and then
  reconnect your remote Cozy. Your selective synchronization configuration will
  thus be kept.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.32.0 - 2022-01-18

Improvements for all users:

- Selective synchronization is available behind the
  `settings.partial-desktop-sync.show-synced-folders-selection` flag.
- The core of the synchronization process can handle selective synchronization
  without flags (only the configuration of the selective synchronization remains
  hidden behind a flag).
- The selective synchronization flag is fetched from the remote Cozy for every
  use case.
- We fixed an issue in our synchronization process which could lead to
  unnecessary metadata updates.
- When the app's OAuth client is revoked on the remote Cozy, fetching the Cozy's
  flags and capabilities won't result into an error anymore and the revocation
  pop-up will displayed again instead of the generic "Synchronization
  impossible" status.
- GUI state updates will now be queued up to avoid having two close updates
  overwrite each other and ending in a de-synchronized state between the app's
  main Window and the systray.
- Most remote folder deletion situations should be handled and the same goes for
  remote folder exclusions as part of the selective synchronization.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.32.0-beta.3 - 2022-01-05

Improvements for all users:

- The core of the synchronization process can handle selective synchronization
  without flags (only the configuration of the selective synchronization remains
  hidden behind a flag).
- Most remote folder deletion situations should be handled and the same goes for
  remote folder exclusions as part of the selective synchronization.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.32.0-beta.2 - 2021-12-15

Improvements for all users:

- The selective synchronization flag is fetched from the remote Cozy for every
  use case.
- We fixed an issue in our synchronization process which could lead to
  unnecessary metadata updates.
- When the app's OAuth client is revoked on the remote Cozy, fetching the Cozy's
  flags and capabilities won't result into an error anymore and the revocation
  pop-up will displayed again instead of the generic "Synchronization
  impossible" status.
- GUI state updates will now be queued up to avoid having two close updates
  overwrite each other and ending in a de-synchronized state between the app's
  main Window and the systray.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.32.0-beta.1 - 2021-11-17

Improvements for all users:

- Selective synchronization is available behind the
  `settings.partial-desktop-sync.show-synced-folders-selection` flag.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.31.0 - 2021-11-08

Improvements for all users:

- We upgraded our Electron dependency to v12.2.1 which includes lots of CVE
  patches, a patch for a certificate issue following the end of the
  Let's Encrypt first root certificate validity and patches around certificates
  validation which we hope should resolve the missing network problem some users
  are experiencing.
- We updated some of our status messages with the hope they will be easier to
  understand.
- We will now automatically refresh the app's OAuth client when it expires on
  any request. This should prevent synchronization errors and avoid the need for
  restarting the app in such cases.
- We have improved the performance of the initial remote changes fetch which
  could be slow enough on old Cozy to fail.
- We've tweaked the app's status update to make it less likely to show an
  "up-to-date" status while we're actually fetching changes from the Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.31.0-beta.2 - 2021-11-04

Improvements for all users:

- We will now automatically refresh the app's OAuth client when it expires on
  any request. This should prevent synchronization errors and avoid the need for
  restarting the app in such cases.
- We have improved the performance of the initial remote changes fetch which
  could be slow enough on old Cozy to fail.
- We've tweaked the app's status update to make it less likely to show an
  "up-to-date" status while we're actually fetching changes from the Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.31.0-beta.1 - 2021-10-14

Improvements for all users:

- We upgraded our Electron dependency to v12.2.1 which includes lots of CVE
  patches, a patch for a certificate issue following the end of the
  Let's Encrypt first root certificate validity and patches around certificates
  validation which we hope should resolve the missing network problem some users
  are experiencing.
- We updated some of our status messages with the hope they will be easier to
  understand.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.1 - 2021-10-05

Improvements for all users:

- We've optimized the initial listing of documents present on the remote Cozy to
  limit the number of necessary network requests and the CPU and RAM usage. This
  should also result in a quicker listing.
- Default values will now be provided by the client for remote metadata when
  they're not provided by cozy-stack.
- We updated the localizations and fixed some GUI texts which were not correctly
  localized.

Improvements for Windows and macOS users:

- The improvement introduced in the latest version around the trashing of
  complete folders (i.e. keeping their hierarchy in the Trash) would in turn
  generate visible errors in the main window and pause the synchronization until
  the remote trashing of all the documents in the folder would be fully
  synchronized.
  We're now making sure the trashing of a folder is swift and does not result in
  unnecessary errors.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.1-beta.3 - 2021-10-04

Improvements for all users:

- We updated the localizations and fixed some GUI texts which were not correctly
  localized.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.1-beta.2 - 2021-09-27

Improvements for all users:

- Default values will now be provided by the client for remote metadata when
  they're not provided by cozy-stack.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.1-beta.1 - 2021-09-21

Improvements for all users:

- We've optimized the initial listing of documents present on the remote Cozy to
  limit the number of necessary network requests and the CPU and RAM usage. This
  should also result in a quicker listing.

Improvements for Windows and macOS users:

- The improvement introduced in the latest version around the trashing of
  complete folders (i.e. keeping their hierarchy in the Trash) would in turn
  generate visible errors in the main window and pause the synchronization until
  the remote trashing of all the documents in the folder would be fully
  synchronized.
  We're now making sure the trashing of a folder is swift and does not result in
  unnecessary errors.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.0 - 2021-09-20

Improvements for all users:

- All child moves (i.e. document moved because their parent directory was moved)
  will now be notified to the GUI so the child documents paths can be updated in
  the list of recently synchronized documents.
- We've introduced a mechanism to detect dependencies between multiple changes
  on the same side (i.e. the local filesystem or the remote Cozy) and
  synchronize them in the right order. We've added a few dependencies that let
  us solve situations that were known to fail (e.g. trashing directories as a
  whole instead of trashing every element separately) and we will add more as
  needed in the future.
- As stated above, directories will now be trashed as a whole but we'll now also
  keep empty directories in the trash instead of erasing them. It should be
  easier for you to find deleted elements in the trash and restore entire
  directories.
- We've decided to stop linking a local and remote directories at the same
  location during the synchronization as this could lead to issues (e.g. if one
  of them was moved and the other created).
  We'll handle this situation as a conflict instead.
- When propagating documents to the remote Cozy, we should now always use the
  correct parent directory which is not necessarily the remote folder with this
  path.
- The propagation of documents to the remote Cozy should now be slightly faster
  as we make fewer requests to the remote Cozy (i.e. we don't look for the
  parent directory on the remote Cozy anymore).
- Name conflicts detected during the synchronization phase will now be notified
  to you within the main window. Their resolution will only happen on your
  behalf via the action button within the error message.
- URLs entered during the client's Onboarding won't be considered as invalid if
  they contain a port but not the http protocol and will be considered as https
  URLs instead.

Improvements for Windows users:

- The detection of local overwriting moves should be more reliable. This also
  improves the propagation of remote overwriting moves to the local filesystem.
- The detection of local directory moves when they have a lot of content should
  be more reliable. This also improves the propagation of remote directory moves
  to the local filesystem.

Improvements for macOS users:

- We've fixed an issue in our local changes watcher that could lead to
  synchronizing a file deletion when actually replacing it with another one on
  the local filesystem.
- We've fixed an issue in our local changes watcher that could lead to
  synchronization errors due to invalid metadata when a file was moved then
  modified in a short period of time or modified multiple times in a short
  period of time, leaving you with a blocked synchronization until the file is
  modified, moved or removed.
- Deletions of children of moved directories while the client was stopped should
  now be correctly detected and propagated to the remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.30.0-beta.1 - 2021-09-09

Improvements for all users:

- All child moves (i.e. document moved because their parent directory was moved)
  will now be notified to the GUI so the child documents paths can be updated in
  the list of recently synchronized documents.
- We've introduced a mechanism to detect dependencies between multiple changes
  on the same side (i.e. the local filesystem or the remote Cozy) and
  synchronize them in the right order. We've added a few dependencies that let
  us solve situations that were known to fail (e.g. trashing directories as a
  whole instead of trashing every element separately) and we will add more as
  needed in the future.
- As stated above, directories will now be trashed as a whole but we'll now also
  keep empty directories in the trash instead of erasing them. It should be
  easier for you to find deleted elements in the trash and restore entire
  directories.
- We've decided to stop linking a local and remote directories at the same
  location during the synchronization as this could lead to issues (e.g. if one
  of them was moved and the other created).
  We'll handle this situation as a conflict instead.
- When propagating documents to the remote Cozy, we should now always use the
  correct parent directory which is not necessarily the remote folder with this
  path.
- The propagation of documents to the remote Cozy should now be slightly faster
  as we make fewer requests to the remote Cozy (i.e. we don't look for the
  parent directory on the remote Cozy anymore).
- Name conflicts detected during the synchronization phase will now be notified
  to you within the main window. Their resolution will only happen on your
  behalf via the action button within the error message.

Improvements for Windows users:

- The detection of local overwriting moves should be more reliable. This also
  improves the propagation of remote overwriting moves to the local filesystem.
- The detection of local directory moves when they have a lot of content should
  be more reliable. This also improves the propagation of remote directory moves
  to the local filesystem.

Improvements for macOS users:

- We've fixed an issue in our local changes watcher that could lead to
  synchronizing a file deletion when actually replacing it with another one on
  the local filesystem.
- We've fixed an issue in our local changes watcher that could lead to
  synchronization errors due to invalid metadata when a file was moved then
  modified in a short period of time or modified multiple times in a short
  period of time, leaving you with a blocked synchronization until the file is
  modified, moved or removed.
- Deletions of children of moved directories while the client was stopped should
  now be correctly detected and propagated to the remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.29.0 - 2021-08-18

Improvements for all users:

- Cozy Notes with photos will be exported as a tar archive instead of a simple
  markdown file. Therefore, the client will now unpack the markdown file from
  the archive when displaying a note in a degraded mode (i.e. when you're
  offline or the actual note can't be found on the remote Cozy).
- Error messages will now be properly localized and the document names included
  in some of them should be properly displayed instead of their type.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.29.0-beta.2 - 2021-08-17

Improvements for all users:

- Error messages will now be properly localized and the document names included
  in some of them should be properly displayed instead of their type.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.29.0-beta.1 - 2021-08-10

Improvements for all users:

- Cozy Notes with photos will be exported as a tar archive instead of a simple
  markdown file. Therefore, the client will now unpack the markdown file from
  the archive when displaying a note in a degraded mode (i.e. when you're
  offline or the actual note can't be found on the remote Cozy).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.1 - 2021-08-04

Improvements for all users:

- The client will now detect when the connected Cozy has been deleted and will
  show an error message accordingly.
  The synchronization will be stopped until you connect your client to another
  Cozy.
- We've worked on the process which decides if a synchronization error needs to
  be displayed or not to make sure you get alerted with the suspended
  synchronization status only if accompanied with an explicit error message.
- In some rare situations where a document that was previously synchronized is
  now only present on one side (i.e. we're in the middle of re-synchronizing it)
  a conflict could be generated if the document was modified on that remaining
  side.
  We've introduced some mitigations to avoid generating those conflicts.
- Due to a "bug" in Chromium (i.e. which we use through Electron to provide our
  network stack), some error responses sent by the remote Cozy to our file
  upload requests are transformed into a cryptic error which we cannot deal with
  directly. In such cases, we end up interpreting them as unreachable Cozy
  errors which is misleading to you.
  We caught and fixed two of those cases:
  * when sending files larger than the maximum allowed by the remote Cozy (i.e.
    5 GiB for Cozies hosted by us)
  * when the amount of data sent does not match the expected file size (i.e.
    because the actual local file has grown since last we detected a change)
- We'll now consider the propagation of a move to the trash either on the local
  filesystem or the remote Cozy as successful when the given document does not
  exist anymore.
  This will prevent delays during the synchronization process since we won't
  have to deal with retries.

Improvements for Windows users:

- The last modification and last access dates on Windows were not precise enough
  for Cozy Desktop to detect sub-second local modifications. This would
  sometimes lead to `Invalid metadata` errors when sending modifications to the
  remote Cozy.
  We've increased this precision to include milliseconds so we should not lose
  any local modification anymore.

Improvements for macOS users:

- Moving a local document to a folder that was just renamed or moved (e.g. a
  folder that was just created with a custom name) will be properly handled and
  not generate incoherent movements.
- Some steps of the initial scan could be run twice if some local modifications
  were detected while the initial scan was still running.
  We've made sure we don't lose time of consume unnecessary computing resources
  by making sure those steps are only run for the real initial scan.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.1-beta.4 - 2021-08-03

Improvements for all users:

- We've realized that the errors thrown when trying to trash a missing local
  document would not always be caught because of an unexpected message
  localization.
  We've completely changed the way we catch these errors to not depend on their
  message altogether.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.1-beta.3 - 2021-07-28

Improvements for all users:

- We'll now consider the propagation of a move to the trash either on the local
  filesystem or the remote Cozy as successful when the given document does not
  exist anymore.
  This will prevent delays during the synchronization process since we won't
  have to deal with retries.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.1-beta.2 - 2021-07-20

Improvements for Windows users:

- The last modification and last access dates on Windows were not precise enough
  for Cozy Desktop to detect sub-second local modifications. This would
  sometimes lead to `Invalid metadata` errors when sending modifications to the
  remote Cozy.
  We've increased this precision to include milliseconds so we should not lose
  any local modification anymore.

Improvements for all users:

- Due to a "bug" in Chromium (i.e. which we use through Electron to provide our
  network stack), some error responses sent by the remote Cozy to our file
  upload requests are transformed into a cryptic error which we cannot deal with
  directly. In such cases, we end up interpreting them as unreachable Cozy
  errors which is misleading to you.
  We caught and fixed two of those cases:
  * when sending files larger than the maximum allowed by the remote Cozy (i.e.
    5 GiB for Cozies hosted by us)
  * when the amount of data sent does not match the expected file size (i.e.
    because the actual local file has grown since last we detected a change)

Improvements for macOS users:

- Some steps of the initial scan could be run twice if some local modifications
  were detected while the initial scan was still running.
  We've made sure we don't lose time of consume unnecessary computing resources
  by making sure those steps are only run for the real initial scan.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.1-beta.1 - 2021-05-25

Improvements for all users:

- The client will now detect when the connected Cozy has been deleted and will
  show an error message accordingly. The synchronization will be stopped until
  you connect your client to another Cozy.
- We've worked on the process which decides if a synchronization error needs to
  be displayed or not to make sure you get alerted with the suspended
  synchronization status only if accompanied with an explicit error message.
- In some rare situations where a document that was previously synchronized is
  now only present on one side (i.e. we're in the middle of re-synchronizing it)
  a conflict could be generated if the document was modified on that remaining
  side.
  We've introduced some mitigations to avoid generating those conflicts.

Improvements for macOS users:

- Moving a local document to a folder that was just renamed or moved (e.g. a
  folder that was just created with a custom name) will be properly handled and
  not generate incoherent movements.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.0 - 2021-05-17

Improvements for all users:

- The client will only trigger one synchronization retry loop when encountering
  an unreachable Cozy error in both the synchronization process and the remote
  watcher very closely.
- New remote documents whose path would be incompatible with the local
  filesystem will not be ignored anymore.
- Local documents who've been moved or renamed remotely to a path that would be
  incompatible with the local filesystem won't be trashed anymore.
- Changes that can't be synchronized because the document has an incompatible
  name or path with the local filesystem will now suspend the synchronization
  and an error message will be displayed so you can take action.
- Moves for which the destination path is exactly the same as the source path
  will now be treated as modifications rather than triggering errors.

Improvements for Windows and macOS users:

- After the remote Cozy has been found unreachable because of a network error
  such as a interface change, the subsequent requests won't fail anymore with
  the same error once a stable connection is back.

Improvements for Windows users:

- The client should not create conflicts anymore when propagating on Windows the
  combination of the move/renaming and the modification of a Cozy Note (via the
  Notes web application).
- It seems that paths on Windows created by the Desktop client can actually
  exceed the 259 characters limit. Therefore we've increased the limit defined
  in the client itself to 32766 characters.
  Documents that had been previously found incompatible with the local
  filesystem because of the previous path length limit will be updated to take
  the new limit into account. Most of them should thus become compatible.
- Synchronization error messages displayed in the main window will now only
  contain the name of the document involved instead of its complete path.

Improvements for macOS users:

- Custom folder icons will now be ignored to avoid blocking the synchronization
  as their name contains a character forbidden on remote Cozies.
- The app dock icon should now only be visible when an app window other than the
  main window is open. This should also prevent blocking the computer shutdown.

Improvements for Linux users:

- The client won't show a popup error message anymore when automatically
  starting with the computer.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.0-beta.2 - 2021-05-11

Improvements for Windows and macOS users:

- After the remote Cozy has been found unreachable because of a network error
  such as a interface change, the subsequent requests won't fail anymore with
  the same error once a stable connection is back.

Improvements for Windows users:

- Documents that had been previously found incompatible with the local
  filesystem because of the previous path length limit will be updated to take
  the new limit into account. Most of them should thus become compatible.
- Synchronization error messages displayed in the main window will now only
  contain the name of the document involved instead of its complete path.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.28.0-beta.1 - 2021-05-06

Improvements for all users:

- The client will only trigger one synchronization retry loop when encountering
  an unreachable Cozy error in both the synchronization process and the remote
  watcher very closely.
- New remote documents whose path would be incompatible with the local
  filesystem will not be ignored anymore.
- Local documents who've been moved or renamed remotely to a path that would be
  incompatible with the local filesystem won't be trashed anymore.
- Changes that can't be synchronized because the document has an incompatible
  name or path with the local filesystem will now suspend the synchronization
  and an error message will be displayed so you can take action.
- Moves for which the destination path is exactly the same as the source path
  will now be treated as modifications rather than triggering errors.

Improvements for Windows users:

- The client should not create conflicts anymore when propagating on Windows the
  combination of the move/renaming and the modification of a Cozy Note (via the
  Notes web application).
- It seems that paths on Windows created by the Desktop client can actually
  exceed the 259 characters limit. Therefore we've increased the limit defined
  in the client itself to 32766 characters.

Improvements for macOS users:

- Custom folder icons will now be ignored to avoid blocking the synchronization
  as their name contains a character forbidden on remote Cozies.
- The app dock icon should now only be visible when an app window other than the
  main window is open. This should also prevent blocking the computer shutdown.

Improvements for Linux users:

- The client won't show a popup error message anymore when automatically
  starting with the computer.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.27.0 - 2021-04-13

Improvements for all users:

- The Electron framework was upgraded to v12.0.0. This major version fixes a lot
  of security errors as well as other smaller errors like crashes.
- The Desktop client will now use the Electron API to send local folders and
  files to the OS trash. This should ensure that these documents can be restored
  from the trash via the default trash operations and that their names are
  preserved.
- Missing parent folders when merging or propagating a child change will not be
  created by default as this could lead to conflicts down the road. We will
  instead rely on retry mechanisms to make sure ancestor folders exist before
  saving a document record in PouchDB or propagating it to the remote Cozy.
  Local parent directories will still be created if missing when propagating a
  remote change as this should not lead to conflicts.
- The synchronization error management has been improved to make sure you don't
  get stuck over a synchronization failure that should get resolved with retries
  or could manually be skipped.
- We've fixed a local watcher issue that prevented the synchronization of
  folders moves or renamings before they got propagated to the remote Cozy if
  they have child documents.
- Platform incompatibilities errors raised during the propagation of remote
  changes to the local filesystem (e.g. when characters forbidden by the local
  filesystem are present in some document's name on the remote Cozy) will now be
  handled as other synchronization errors. To mimic the previous behavior,
  changes raising those errors will be skipped altogether.
- We've fixed a regression that prevented the propagation of a file deletion if
  that file had been previously modified on the same side and this modification
  was not yet propagated.
- We've fixed an issue that prevented the propagation of a local document
  deletion if its parent folder is then moved or renamed on the same side before
  the deletion is propagated.
- We've fixed an issue that prevented the propagation of a folder deletion if it
  had been previously moved or renamed on the same side and this move was not
  yet propagated.
- We've fixed an issue that prevented the propagation of a file replacement with
  an other synced file if it was modified on the same side before the
  replacement could be propagated.
- We've made some small changes to the design of the list of recently synced
  files to harmonize it with the design you're used to in your Drive application
  on the Web.
- We're now using abbreviations for the time units used in the recently
  synchronized files list to express the time elapsed since the file was last
  synchronized.
- We've changed the default action executed when clicking on an element in the
  list of recently synced files. It will now open the file in your OS default
  application for its type. You can still show it in its parent folder by
  clicking on its parent folder path, displayed right under its name.
- The tooltips displayed when hovering over a file line or its parent path will
  now tell you which action will be performed on click (i.e. showing the file in
  its parent path when clicking the parent folder path or opening the file in
  the appropriate application).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.27.0-beta.3 - 2021-04-10

Improvements for all users:

- We've put back the original globe icon for the "Open Cozy" button as it is the
  illustration used for small icons when the newer globe is used for larger
  ones.
- We're now using abbreviations for the time units used in the recently
  synchronized files list to express the time elapsed since the file was last
  synchronized.
- The tooltips displayed when hovering over a file line or its parent path will
  now tell you which action will be performed on click (i.e. showing the file in
  its parent path when clicking the parent folder path or opening the file in
  the appropriate application).

Improvements for Windows users:

- The leading path separator in parent folder paths displayed in the recently
  synchronized files list is now the current platform's main separator.
  This means Windows users will now see a backslash (`\`) as is used in the rest
  of the path.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.27.0-beta.2 - 2021-04-06

Improvements for all users:

- We forgot to modify the packaging configuration and some files were left out,
  preventing the client from starting.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.27.0-beta.1 - 2021-04-06

Improvements for all users:

- The Electron framework was upgraded to v12.0.0. This major version fixes a lot
  of security errors as well as other smaller errors like crashes.
- The Desktop client will now use the Electron API to send local folders and
  files to the OS trash. This should ensure that these documents can be restored
  from the trash via the default trash operations and that their names are
  preserved.
- Missing parent folders when merging or propagating a child change will not be
  created by default as this could lead to conflicts down the road. We will
  instead rely on retry mechanisms to make sure ancestor folders exist before
  saving a document record in PouchDB or propagating it to the remote Cozy.
  Local parent directories will still be created if missing when propagating a
  remote change as this should not lead to conflicts.
- The synchronization error management has been improved to make sure you don't
  get stuck over a synchronization failure that should get resolved with retries
  or could manually be skipped.
- We've fixed a local watcher issue that prevented the synchronization of
  folders moves or renamings before they got propagated to the remote Cozy if
  they have child documents.
- Platform incompatibilities errors raised during the propagation of remote
  changes to the local filesystem (e.g. when characters forbidden by the local
  filesystem are present in some document's name on the remote Cozy) will now be
  handled as other synchronization errors. To mimic the previous behavior,
  changes raising those errors will be skipped altogether.
- We've fixed a regression that prevented the propagation of a file deletion if
  that file had been previously modified on the same side and this modification
  was not yet propagated.
- We've fixed an issue that prevented the propagation of a local document
  deletion if its parent folder is then moved or renamed on the same side before
  the deletion is propagated.
- We've fixed an issue that prevented the propagation of a folder deletion if it
  had been previously moved or renamed on the same side and this move was not
  yet propagated.
- We've fixed an issue that prevented the propagation of a file replacement with
  an other synced file if it was modified on the same side before the
  replacement could be propagated.
- We've made some small changes to the design of the list of recently synced
  files to harmonize it with the design you're used to in your Drive application
  on the Web.
- We've changed the default action executed when clicking on an element in the
  list of recently synced files. It will now open the file in your OS default
  application for its type. You can still show it in its parent folder by
  clicking on its parent folder path, displayed right under its name.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.1 - 2021-03-16

Improvements for all users:

- The mechanism we introduced in the last version to resolve conflicts from the
  synchronization process when we've run out of options was assuming that the
  current date of the computer would always be greater than the last
  modification date of the document being renamed on the remote Cozy.
  Since this is not always the case and the remote Cozy will refuse the renaming
  in those situations, we'll use the same workaround than for the other requests
  and send the most recent date between the current local date and the last
  modification date of the remote document.
- Whenever a file move or name change is synchronized, we'll properly remove its
  source path entry from the Recent list in the main window. Its destination
  path entry will remain as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.1-beta.2 - 2021-03-15

Improvements for all users:

- Whenever a file move or name change is synchronized, we'll properly remove its
  source path entry from the Recent list in the main window. Its destination
  path entry will remain as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.1-beta.1 - 2021-03-15

Improvements for all users:

- The mechanism we introduced in the last version to resolve conflicts from the
  synchronization process when we've run out of options was assuming that the
  current date of the computer would always be greater than the last
  modification date of the document being renamed on the remote Cozy.
  Since this is not always the case and the remote Cozy will refuse the renaming
  in those situations, we'll use the same workaround than for the other requests
  and send the most recent date between the current local date and the last
  modification date of the remote document.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.0 - 2021-03-08

Improvements for all users:

- Files that were modified then trashed on your Cozy before the Desktop client
  could fetch the modification will be trashed on your computer and your Cozy
  and not re-uploaded.
- The workaround we introduced in the previous release to help synchronize
  modifications to your remote Cozy when modification dates are not the same in
  the local database and the remote Cozy created a regression for users who
  locally modified documents that had not been modified in a very long time and
  did not have the remote modification date stored in the local database.
  For those documents, we'll skip the workaround and hope that the local
  modification date is more recent than the remote one (which is very likely).
- If some of your documents (files like directories) have local names starting
  or ending with white-spaces, the client would remove those spaces when sending
  them to your remote Cozy thus creating a de-synchronized state between their
  local and remote versions. This would prevent the client from finding their
  remote version in later requests.
  We're now making sure their names are not modified when sending them to your
  remote Cozy.
- Because of a limitation in Electron v7+, we would not be able to advertise the
  size of a file being uploaded to your remote Cozy, preventing it from refusing
  the upload right away if the file was too large or not enough disk space was
  available on the Cozy. In those cases, the client would thus send the whole
  file to see it refused by the Cozy.
  The Cozy can now receive the file size via a request parameter which allows us
  to work around the Electron limitation and get feedback on the upload from the
  very beginning thus saving time and resources.
- In the previous release, we started managing and sometimes displaying
  synchronization errors within the client's interface but we grouped a lot of
  data and metadata related errors together as an "Unreachable Cozy" state. This
  lead to a lot of confusion as the Cozy was most of the time perfectly
  reachable and the underlying issues would not be solved.
  We now try to manage most of those errors as best we can and provide ways to
  solve the underlying issues either automatically or by notifying you.
- Some expectations we were making on the shape of local metadata stored in
  PouchDB were not met and resulted in exceptions being thrown with the recent
  changes done to the initial scan.
  We've taken measures to make sure those expectations are met in the future and
  existing metadata is cleaned up to meet these expectations as well.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.0-beta.2 - 2021-03-04

Improvements for all users:

- Some expectations made in the previous beta release on the local metadata
  stored in PouchDB were not met and resulted in exceptions being thrown thus
  stopping the synchronization.
  We've taken measures to make sure those expectations are met in the future and
  existing metadata is cleaned up to meet these expectations as well.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.26.0-beta.1 - 2021-03-03

Improvements for all users:

- Files that were modified then trashed on your Cozy before the Desktop client
  could fetch the modification will be trashed on your computer and your Cozy
  and not re-uploaded.
- The workaround we introduced in the previous release to help synchronize
  modifications to your remote Cozy when modification dates are not the same in
  the local database and the remote Cozy created a regression for users who
  locally modified documents that had not been modified in a very long time and
  did not have the remote modification date stored in the local database.
  For those documents, we'll skip the workaround and hope that the local
  modification date is more recent than the remote one (which is very likely).
- If some of your documents (files like directories) have local names starting
  or ending with white-spaces, the client would remove those spaces when sending
  them to your remote Cozy thus creating a de-synchronized state between their
  local and remote versions. This would prevent the client from finding their
  remote version in later requests.
  We're now making sure their names are not modified when sending them to your
  remote Cozy.
- Because of a limitation in Electron v7+, we would not be able to advertise the
  size of a file being uploaded to your remote Cozy, preventing it from refusing
  the upload right away if the file was too large or not enough disk space was
  available on the Cozy. In those cases, the client would thus send the whole
  file to see it refused by the Cozy.
  The Cozy can now receive the file size via a request parameter which allows us
  to work around the Electron limitation and get feedback on the upload from the
  very beginning thus saving time and resources.
- In the previous release, we started managing and sometimes displaying
  synchronization errors within the client's interface but we grouped a lot of
  data and metadata related errors together as an "Unreachable Cozy" state. This
  lead to a lot of confusion as the Cozy was most of the time perfectly
  reachable and the underlying issues would not be solved.
  We now try to manage most of those errors as best we can and provide ways to
  solve the underlying issues either automatically or by notifying you.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0 - 2021-02-04

Improvements for all users:

- Some synchronization errors will now be notified to you within the main window
  with information about the error itself and how to fix it. Although automatic
  retries will be performed in the background, you'll have the opportunity to
  request an early retry via the interface.
  Know that the synchronization will be blocked by the failing change until it
  can finally be applied. This should avoid a lot of automatically dropped
  changes as we would otherwise stop retrying after the third failed attempt.
- We upgraded the framework upon which our application is built, Electron, to
  v11.1.1 which is the latest stable version. This should bring more stability
  to the application overall and fix an issue on macOS Big Sur which was
  preventing the application from restarting after an upgrade.
- We've changed the way we handle the simultaneous deletions of the same
  document on the remote Cozy and the local filesystem so that any resulting
  synchronization conflict is only temporary (i.e. you would see an error
  message but it should be resolved during the following retry).
- Clients can now be disconnected from the remote Cozy even if it is no longer
  reachable (e.g. completely deleted or deleted after being moved to another
  domain). The local configuration and database will be wiped out.
- We'll now verify if the Cozy has enough space before uploading files to avoid
  wasting time and resources to get an error at the end of the upload.
- Sometimes, the creation and modification dates of documents created on the
  remote Cozy at the initiative of the desktop client are different from those
  supplied by the client. This can come from the presence of EXIF metadata in
  photos for example. To avoid any refusal by the Cozy to apply future actions
  on these documents, we will now always pass the most recent modification date
  between that of the file system and that of the Cozy in requests sent to the
  Cozy.
- We're now making sure the list of recently synchronized files persisted to
  disk includes only one occurrence of each file since we display only one of
  them. With this change, the displayed list will always contain 250 elements
  once this number is reached.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0-beta.5 - 2021-02-02

Improvements for all users:

- We're now correctly restarting the remote watcher when we detect the Cozy is
  reachable again after a failed attempt at fetching changes from the remote
  Cozy.
- We're now making sure the list of recently synchronized files persisted to
  disk includes only one occurrence of each file since we display only one of
  them. With this change, the displayed list will always contain 250 elements
  once this number is reached.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0-beta.4 - 2021-01-29

Improvements for all users:

- Clients can now be disconnected from the remote Cozy even if it is no longer
  reachable (e.g. completely deleted or deleted after being moved to another
  domain). The local configuration and database will be wiped out.
- Changes that we failed to synchronize and should be retried will now be
  retried without previously running a check that validates if the
  synchronization should be successful. All changes made either on the local
  filesystem or the remote Cozy will thus be taken into account when retrying.
- We'll now verify if the Cozy has enough space before uploading files to avoid
  wasting time and resources to get an error at the end of the upload.
- Sometimes, the creation and modification dates of documents created on the
  remote Cozy at the initiative of the desktop client are different from those
  supplied by the client. This can come from the presence of EXIF metadata in
  photos for example. To avoid any refusal by the Cozy to apply future actions
  on these documents, we will now always pass the most recent modification date
  between that of the file system and that of the Cozy in requests sent to the
  Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0-beta.3 - 2021-01-18

Improvements for all users:

- To make sure you're not tempted to give up on some changes because of a
  temporary error and end up with an desynchronized state and potentially lose
  data, we've removed the possibility to manually give up for most errors that
  are displayed to you in the main window. Instead, only conflicts with the
  remote Cozy will be droppable as we sometimes find ourselves in a situation
  where the conflict will never be resolved.

Improvements for Windows users:

- We've removed a duplicate retry mechanism for failed movements of locked
  documents (e.g. opened Office documents or being checked by an Anti-Virus
  software). This should speed up retries when the document is still locked.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0-beta.2 - 2021-01-14

Improvements for all users:

- We upgraded the framework upon which our application is built, Electron, to
  v11.1.1 which is the latest stable version. This should bring more stability
  to the application overall and fix an issue on macOS Big Sur which was
  preventing the application from restarting after an upgrade.
- We've changed the way we handle the simultaneous deletions of the same
  document on the remote Cozy and the local filesystem so that any resulting
  synchronization conflict is only temporary (i.e. you would see an error
  message but it should be resolved during the following retry).
- Several improvements were made to synchronization error detection and messages
  over the previous beta release. Messages should be cleaner with an outstanding
  document name and filesystem locks detection should be better.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.25.0-beta.1 - 2021-01-06

Improvements for all users:

- Some synchronization errors will now be notified to you within the main window
  with information about the error itself and how to fix it and two options:
  giving up on the change if it can't be synchronized or requesting an early
  retry (automatic retries will be performed in the background).
  Know that the synchronization will be blocked by the failing change until an
  outcome is decided. This should avoid a lot of automatically dropped changes
  as we would otherwise stop retrying after the third attempt.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.1 - 2020-12-07

Improvements for all users:

- We fixed the way we fetch the local documents tree to both prevent failures
  when sending messages to support from the application and send the appropriate
  paths.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.1-beta.1 - 2020-12-07

Improvements for all users:

- We fixed the way we fetch the local documents tree to both prevent failures
  when sending messages to support from the application and send the appropriate
  paths.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.0 - 2020-12-07

Improvements for all users:

- This release lays the ground work for a future synchronization algorithm. We
  now store the complete remote metadata of each document and the local metadata
  of both files and directories. This will allow us to make deeper comparisons
  and take better action in complex situations (e.g. a file modification and
  renaming on the local filesystem with a parent directory renaming on the
  Cozy).
  Another part of this base work is the move to generated PouchDB records ids.
  Those were previously based on the document's path and this scheme had several
  limitations (e.g. when a document was moved or renamed, its record id had to
  change).
- The move to generated PouchDB ids allows you to synchronize documents whose
  name start with an underscore (`_`), in the root synchronization folder. Those
  previously resulted in reserved PouchDB ids and could not be stored thus
  synchronized.
- The upload requests rejection protection does not create memory leaks anymore
  as it will be cleaned up after the requests terminate, whether they're
  successful or not.
- When a new directory is linked with an existing directory on the other side
  (i.e. either the local filesystem or the remote Cozy) with the same name in
  the same parent directory, we'll update the existing directory's metadata with
  the new directory's metadata to make sure they're in sync.
- Now that we track the local metadata of files, we can still detect during the
  start-up local scan if a the file was updated on the local filesystem even if
  a remote update was saved in PouchDB but not synced before the client was
  stopped. With this detection we can decide if a conflict needs to be created
  or not without losing any data and stop applying the remote update in all
  cases.
- We'll now track more closely the local modifications resulting from the
  application on the filesystem of changes fetched from the remote Cozy. This is
  important especially for tracking movements and make sure opposite movements
  won't be wrongly "detected" after a client restart.

Improvements for Windows and Linux users:

- We've made sure the logic dedicated to the initial scan, run after a client
  start, won't be used after the initial scan is done. This was the source of
  bugs when applying folder movements fetched from the remote Cozy.

Improvements for Windows users:

- Files marked as executable and downloaded from the Cozy will remain marked as
  executable on the Cozy and all the devices recognizing this flag (i.e. on
  Linux or macOS). Since this flag is not recognized on Windows, synchronizing
  an executable file with a Windows device would previously remove the flag for
  everybody.

Improvements for macOS users:

- We're now handling moving the same document multiple times in a short delay
  and moving a document just downloaded from the Cozy to a path including UTF-8
  characters on HFS+ filesystems.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.0-beta.3 - 2020-12-01

Improvements for macOS users:

- We're now handling moving the same document multiple times in a short delay
  and moving a document just downloaded from the Cozy to a path including UTF-8
  characters on HFS+ filesystems.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.0-beta.2 - 2020-11-20

Improvements for all users:

- We'll now track more closely the local modifications resulting from the
  application on the filesystem of changes fetched from the remote Cozy. This is
  important especially for tracking movements and make sure opposite movements
  won't be wrongly "detected" after a client restart.

Improvements for Windows and Linux users:

- We've made sure the logic dedicated to the initial scan, run after a client
  start, won't be used after the initial scan is done. This was the source of
  bugs when applying folder movements fetched from the remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.24.0-beta.1 - 2020-10-30

Improvements for all users:

- This release lays the ground work for a future synchronization algorithm. We
  now store the complete remote metadata of each document and the local metadata
  of both files and directories. This will allow us to make deeper comparisons
  and take better action in complex situations (e.g. a file modification and
  renaming on the local filesystem with a parent directory renaming on the
  Cozy).
  Another part of this base work is the move to generated PouchDB records ids.
  Those were previously based on the document's path and this scheme had several
  limitations (e.g. when a document was moved or renamed, its record id had to
  change).
- The move to generated PouchDB ids allows you to synchronize documents whose
  name start with an underscore (`_`), in the root synchronization folder. Those
  previously resulted in reserved PouchDB ids and could not be stored thus
  synchronized.
- The upload requests rejection protection does not create memory leaks anymore
  as it will be cleaned up after the requests terminate, whether they're
  successful or not.
- When a new directory is linked with an existing directory on the other side
  (i.e. either the local filesystem or the remote Cozy) with the same name in
  the same parent directory, we'll update the existing directory's metadata with
  the new directory's metadata to make sure they're in sync.
- Now that we track the local metadata of files, we can still detect during the
  start-up local scan if a the file was updated on the local filesystem even if
  a remote update was saved in PouchDB but not synced before the client was
  stopped. With this detection we can decide if a conflict needs to be created
  or not without losing any data and stop applying the remote update in all
  cases.

Improvements for Windows users:

- Files marked as executable and downloaded from the Cozy will remain marked as
  executable on the Cozy and all the devices recognizing this flag (i.e. on
  Linux or macOS). Since this flag is not recognized on Windows, synchronizing
  an executable file with a Windows device would previously remove the flag for
  everybody.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0 - 2020-10-01

Improvements for all users:

- We upgraded the framework upon which our application is built, Electron, to
  v9.2.1 which is the 2nd latest major version. This should bring more
  stability to the application overall and prevent some crashes. We can also
  expect smaller bundles. This upgrade brings us official support back for a
  while.
- Data migrations run after some client upgrades should not prevent not fully
  synchronized changes from being detected and synchronized after the
  migration.
- Documents added on your remote Cozy, detected by the client but not fully
  synchronized before it is stopped should be synchronized correctly after the
  next client launch. The client should not try to delete them on your Cozy
  because it does not find them locally (the deletions never went through
  fortunately).
- Fixes the displayed icon of recently synchronized files whose type is
  identified as text.
- Fixes the infinite spinner of the Updater window, displayed when download
  progress info is not available.
- Failing file uploads could block the client in an ever ending synchronization
  state because of the way Electron/Chromium treats those errors.
  We've added some workarounds to catch and process those errors to make sure
  the file upload attempt finishes (it will still be failed) and releases
  control back to the synchronization process.

Improvements for Windows users:

- With the Electron upgrade, you should be able to disconnect your client from
  your remote Cozy via the client interface.

Improvements for macOS users:

- The order in which changes fetched from the remote Cozy were processed could
  hinder the paths normalization and lead to issues like conflicts.
  We're now sorting changes before the normalization to make sure the process
  will complete as expected.

Improvements for Linux users:

- If you have disabled the client autolaunch upon your computer startup it
  should not be re-enabled during your next application launch anymore.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.7 - 2020-09-25

Improvements for all users:

- We upgraded `cozy-client-js` for the request abortion, shipped in the previous
  beta release, to work.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.6 - 2020-09-21

Improvements for all users:

- Failing file uploads could block the client in an ever ending synchronization
  state because of the way Electron/Chromium treats those errors.
  We've added some workarounds to catch and process those errors to make sure
  the file upload attempt finishes (it will still be failed) and releases
  control back to the synchronization process.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.5 - 2020-09-09

Improvements for macOS users:

- The order in which changes fetched from the remote Cozy were processed could
  hinder the paths normalization and lead to issues like conflicts.
  We're now sorting changes before the normalization to make sure the process
  will complete as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.4 - 2020-09-07

Improvements for all users:

- Fixes the infinite spinner of the Updater window, displayed when download
  progress info is not available.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.3 - 2020-09-07

Improvements for all users:

- Fixes the displayed icon of recently synchronized files whose type is
  identified as text.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.2 - 2020-08-28

Improvements for all users:

- Fixes a technical issue that prevented the built application from running.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.23.0-beta.1 - 2020-08-28

Improvements for all users:

- We upgraded the framework upon which our application is built, Electron, to
  v9.2.1 which is the 2nd latest major version (v10.0.0 was released 4 days
  ago). This should bring more stability to the application overall and prevent
  some crashes. We can also expect smaller bundles. This upgrade brings us
  official support back for a while.
- Data migrations run after some client upgrades should not prevent not fully
  synchronized changes from being detected and synchronized after the
  migration.
- Documents added on your remote Cozy, detected by the client but not fully
  synchronized before it is stopped should be synchronized correctly after the
  next client launch. The client should not try to delete them on your Cozy
  because it does not find them locally (the deletions never went through
  fortunately).

Improvements for Windows users:

- With the Electron upgrade, you should be able to disconnect your client from
  your remote Cozy via the client interface.

Improvements for Linux users:

- If you have disabled the client autolaunch upon your computer startup it
  should not be re-enabled during your next application launch anymore.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0 - 2020-08-13

Improvements for all users:

- As a multi-device platform, Cozy Cloud tries to keep the modification dates of
  documents in sync across all your devices (i.e. Drive Web, Drive Mobile,
  Cozy Desktop, other people's Cozies…). When modifications happen on the Cozy
  itself, the modification date is set by the server. On the other hand, when
  the modification is made on on your computer, we get the date from your
  filesystem. We were using the most recent date between the content
  modification date and the metadata modification date but we think the content
  modification date is the most important and that it should not be affected by
  movements, renamings, permission changes, etc.
  For this reason, from now on we will only use the content modification date on
  Cozy Desktop.
- Files with remote creation or modification dates in a timezone other than UTC
  would raise an error in the remote watcher when converting them into PouchDB
  records.
  We're now rounding those dates with a timezone agnostic method and those
  errors should not happen anymore.
- When you start your Cozy Desktop client, we scan the whole synchronization
  folder on your computer to detect document additions, modifications,
  movements… The file modification detection is done in 2 steps to avoid time
  consuming computation:
  1. we compare the modification date fetched from your filesystem with the one
     we last saved in our database
  2. if and only if they differ, we compute the file's checksum to compare it
     with the one saved in the database
  Our modification date was not completely reliable, especially on Windows and
  Linux so we were computing a lot of checksums for files that were not modified
  while the client was stopped.
  We're now using the local file state which holds a reliable content
  modification date and we should avoid a lot of checksum computations thus
  saving you a lot of time during a client start and a lot of CPU resources.
- The list of recently synchronized files and the linked Cozy information would
  sometimes not be displayed after a client restart, especially on Windows.
  The data was correctly persisted though and we've made sure it is correctly
  loaded and displayed now.
- The list of recently synchronized files could be persisted multiple times
  concurrently, leading to malformed JSON content which could not be loaded back
  into the client's GUI during the next start.
  We're now making sure each write is done sequentially so that the list is
  always saved as valid JSON.
- The list of recently synchronized files could contain folder items when their
  parent was moved or renamed.
  We're now making sure only file items will be displayed in this list until we
  officially support folder items.
- We increased the number of file types that will be displayed with a specific
  icon to help you check more easily which elements were synchronized. This
  includes 2 new icons for links (i.e. `.url` files) and contacts (i.e. `.vcf`
  files).
- The autolaunch setting could be displayed as enabled when it was disabled from
  the OS settings panel instead of the Cozy Desktop client settings.
  We've made sure the interface shows the actual value of this setting and the
  switch is off when the autolaunch is disabled.

Improvements for Windows and macOS users:

- A file name case change on the remote Cozy followed by a remote content update
  could lead in some situations to the local file being trashed on the computer.
  On macOS this could also happen if the renaming was simply a normalization
  change or there was a normalization difference in the name of one of its
  ancestors.
  We've changed the way we handle the conjunction of those 2 changes to make
  sure case and normalization changes don't affect them. The file should now be
  properly moved and updated on the local filesystem.

Improvements for Windows users:

- Some Windows software save modifications made on a file by moving this file to
  a backup location before writing the new version in its stead. The events
  received by Cozy Desktop in this situation were not correctly interpreted as
  we did not expect it and the client would trash the file on the remote Cozy
  before uploading the new version. If the client were to be stopped before the
  new version was uploaded, the file could stay trashed until the client was
  started again.
  We're now expecting this suite of events to happen and are applying a specific
  behavior to transform them into a file update that will be correctly
  propagated to the remote Cozy as one change thus avoiding situations where the
  file is trashed.
- The local file state introduced in the previous release was not fully
  populated on Windows when propagating the addition of a file from the Cozy to
  the local filesystem due to a bug.
  While it should have been without consequences, the bug was fixed and the
  features requiring this local state to be populated (e.g. limiting the number
  of file checksum computations during a client start) should be fully
  functional.

Improvements for macOS users:

- A lot of improvements around the support of NFD/NFC UTF-8 normalizations for
  document paths, especially when they differ between the remote Cozy and the
  local filesystem.
  You shouldn't see synchronization errors due to the renaming, movement,
  addition, modification of files and folders with accented names.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.6 - 2020-08-12

Improvements for all users:

- The autolaunch setting could be displayed as enabled when it was disabled from
  the OS settings panel instead of the Cozy Desktop client settings.
  We've made sure the interface shows the actual value of this setting and the
  switch is off when the autolaunch is disabled.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.5 - 2020-08-08

Improvements for all users:

- The list of recently synchronized files could contain folder items when their
  parent was moved or renamed.
  We're now making sure only file items will be displayed in this list until we
  officially support folder items.
- We increased the number of file types that will be displayed with a specific
  icon to help you check more easily which elements were synchronized. This
  includes 2 new icons for links (i.e. `.url` files) and contacts (i.e. `.vcf`
  files).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.4 - 2020-08-08

Improvements for all users:

- The list of recently synchronized files could be persisted multiple times
  concurrently, leading to malformed JSON content which could not be loaded back
  into the client's GUI during the next start.
  We're now making sure each write is done sequentially so that the list is
  always saved as valid JSON.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.3 - 2020-07-31

Improvements for all users:

- The list of recently synchronized files and the linked Cozy information would
  sometimes not be displayed after a client restart, especially on Windows.
  The data was correctly persisted though and we've made sure it is correctly
  loaded and displayed now.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.2 - 2020-07-27

Improvements for all users:

- Files with remote creation or modification dates in a timezone other than UTC
  would raise an error in the remote watcher when converting them into PouchDB
  records.
  We're now rounding those dates with a timezone agnostic method and those
  errors should not happen anymore.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.22.0-beta.1 - 2020-07-16

Improvements for all users:

- As a multi-device platform, Cozy Cloud tries to keep the modification dates of
  documents in sync across all your devices (i.e. Drive Web, Drive Mobile,
  Cozy Desktop, other people's Cozies…). When modifications happen on the Cozy
  itself, the modification date is set by the server. On the other hand, when
  the modification is made on on your computer, we get the date from your
  filesystem. We were using the most recent date between the content
  modification date and the metadata modification date but we think the content
  modification date is the most important and that it should not be affected by
  movements, renamings, permission changes, etc.
  For this reason, from now on we will only use the content modification date on
  Cozy Desktop.
- When you start your Cozy Desktop client, we scan the whole synchronization
  folder on your computer to detect document additions, modifications,
  movements… The file modification detection is done in 2 steps to avoid time
  consuming computation:
  1. we compare the modification date fetched from your filesystem with the one
     we last saved in our database
  2. if and only if they differ, we compute the file's checksum to compare it
     with the one saved in the database
  Our modification date was not completely reliable, especially on Windows and
  Linux so we were computing a lot of checksums for files that were not modified
  while the client was stopped.
  We're now using the local file state which holds a reliable content
  modification date and we should avoid a lot of checksum computations thus
  saving you a lot of time during a client start and a lot of CPU resources.

Improvements for Windows and macOS users:

- A file name case change on the remote Cozy followed by a remote content update
  could lead in some situations to the local file being trashed on the computer.
  On macOS this could also happen if the renaming was simply a normalization
  change or there was a normalization difference in the name of one of its
  ancestors.
  We've changed the way we handle the conjunction of those 2 changes to make
  sure case and normalization changes don't affect them. The file should now be
  properly moved and updated on the local filesystem.

Improvements for Windows users:

- Some Windows software save modifications made on a file by moving this file to
  a backup location before writing the new version in its stead. The events
  received by Cozy Desktop in this situation were not correctly interpreted as
  we did not expect it and the client would trash the file on the remote Cozy
  before uploading the new version. If the client were to be stopped before the
  new version was uploaded, the file could stay trashed until the client was
  started again.
  We're now expecting this suite of events to happen and are applying a specific
  behavior to transform them into a file update that will be correctly
  propagated to the remote Cozy as one change thus avoiding situations where the
  file is trashed.
- The local file state introduced in the previous release was not fully
  populated on Windows when propagating the addition of a file from the Cozy to
  the local filesystem due to a bug.
  While it should have been without consequences, the bug was fixed and the
  features requiring this local state to be populated (e.g. limiting the number
  of file checksum computations during a client start) should be fully
  functional.

Improvements for macOS users:

- A lot of improvements around the support of NFD/NFC UTF-8 normalizations for
  document paths, especially when they differ between the remote Cozy and the
  local filesystem.
  You shouldn't see synchronization errors due to the renaming, movement,
  addition, modification of files and folders with accented names.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0 - 2020-06-25

Improvements for all users:

- Moving a document to an ignored location (see
  https://github.com/cozy-labs/cozy-desktop/blob/master/core/config/.cozyignore
  and your local `.cozyignore` rules file) after another move would result in
  the first move being propagated to the remote Cozy and the document being
  desynchronized after that.
  From now on, the second move to the ignored location will cancel the first
  move and the client will correctly propagate a deletion to the remote Cozy.
- Deleting a file on your Cozy while moving it on your local filesystem with
  your client stopped would lead to the desynchronisation of the file. It would
  be deleted on your Cozy but would still exist on your local filesystem and all
  later modifications would not be propagated.
  We're now refusing the deletion because we believe the movement indicates a
  desire to keep the file and it seems easier for the user to understand and fix
  the situation if that was not the expected behavior. The file move will then
  be propagated to the remote Cozy and kept in sync.
- In some situations we can detect changes made on your remote Cozy on documents
  of which we haven't yet received the parent folders. We can't process orphaned
  documents so we require the parents of all documents before we allow
  processing those and if we don't have them, we'll issue an error that results
  in the "Synchronization incomplete" status message, literally blocking the
  synchronization process.
  We believe that most of those issues could resolve themselves by merely
  refusing the orphan change and synchronizing the other changes so we've
  decided not to block the synchronization process anymore when we encounter
  orphan changes.
- We detected that the remote watcher whose role is to detect, fetch and analyze
  changes coming from your remote Cozy could fail without the synchronization
  process stopping and alerting you. This means that in such cases, the changes
  made on your local filesystem would still be detected and potentially
  propagated to your remote Cozy but the changes made remotely would not be
  applied locally until a client restart.
  We've refactored the life-cycle management of the whole synchronization
  process and the remote watcher and we made sure that errors coming from the
  remote watcher are caught by the synchronization process which will in turn
  alert you and stop itself and both local and remote watchers.
- The client would not detect the correct mime type for `.cozy-note` files when
  detected on the local filesystem. This would change the saved mime type of
  notes moved on the local filesystem and not show the correct icon in the
  Recent changes list in our main window.
  We've switched to a custom mime detector for those files to detect our custom
  mime type.
- Since propagating a local file update to a remote Cozy Note would break this
  note (i.e. it would not be detected as such and we would lose its actual
  content while still keeping its markdown export within the associated Cozy
  file), we've decided to prevent all local note updates to be propagated to the
  remote Cozy.
- In order to still synchronize your local updates to notes with your remote
  Cozy, we're now using the conflict mechanism to rename the original note on
  the remote Cozy before upload your new content to the appropriate location.
  This way, you have both your updated content and the original note that can
  still be edited within the Cozy Notes application.
- We've found that when renaming a folder while another folder within the same
  parent starts with the renamed folder's original name (e.g. renaming `cozy` to
  `cozy cloud` while you have `cozy company` in the same parent) would lead to
  the incorrect movement of the content of the other folder (i.e. the content of
  `cozy company` in our example).
  We've fixed the algorithm that lists the content of a folder so that it looks
  only within the exact given location and not similar locations.
- In some situations, locally creating a folder within a moved or renamed parent
  could lead to the creation of a new parent folder on the remote Cozy at the
  target location, thus making the parent movement impossible since a document
  would already exist at the target location. This situation was caused by some
  logic we implemented to help create complex hierarchies in any order. We would
  create a missing parent folder when creating a new folder on the remote Cozy.
  We've now stopped doing this and will not synchronize the creation of a folder
  if its parent does not exist. In case the parent location would be created
  later by the client (e.g. when propagating the parent movement), the new
  folder will eventually be synchronized.
- Remote changes resulting in an `MergeMissingParentError` do not block the
  synchronization process since v3.21.0-beta.1 but the changes from the affected
  batch and the ones coming after will be fetched over and over again until the
  errors are resolved, which might never come.
  We've identified a few sources of those errors that should be fixed really
  soon and believe we should not encounter solvable missing parent issues
  anymore so we've decided to mark them as processed anyway and rely on the next
  changes to resolve those missing parents issues.
- We added a migration to force a refetch of all remote Cozy Notes in order to
  avoid as many dispensable conflicts as we can during the first reboot after
  this release installation.
- We made sure a Cozy Note is still identified as such after saving changes like
  an update on the remote Cozy. This will ensure they will stay protected from
  local updates afterwards.
- Until now the authentication of your Cozy during the initial connection of the
  client would always be done by our own remote application. We're adding the
  possibility for partners to offer their users to connect via their own SSO
  portal so we now run the connection flow in a dedicated sandbox.
  This has two advantages when an SSO portal is involved:
  1. the portal code is run in a browser like environment with no alterations so
     it should work out of the box
  2. the portal code is isolated from the rest of our application adding another
     layer of security preventing malicious code on the portal itself to access
     your computer
- We made sure the application of the move and update of a file on the local
  filesystem does not trigger invalid changes that would be propagated to the
  remote Cozy.
- We discovered timing issues during the propagation of remote file changes to
  the local filesystem. These can result in invalid metadata being sent to the
  remote Cozy after propagating a grouped content update and file renaming. In
  case the file was in a shared directory, the metadata change would in turn be
  propagated via the sharing to other Cozies and we can end up with a
  completely desynchronized file and conflicts.
  To prevent these invalid metadata from being propagated to the remote Cozy, we
  introduced a new way to store and compare local file states. This also helps
  us detect during a client restart when a remote file modification was fetched
  but not completely propagated to the file system and avoid creating a
  conflict.

Improvements for Windows users:

- To emphasize the fact that Cozy Notes should not be edited on your local
  filesystem we were marking the local note files as read-only. This was not
  preventing us from overwriting them with new remote updates on Linux and
  macOS but it was on Windows in some cases. When this would happen, the local
  file content would not reflect the remote content anymore and it could even
  lead to the remote Note being broken after a Desktop client restart.
  Since we've now introduced a conflict mechanism to protect Cozy Notes from
  local modifications, we can remove the read-only permission and remote updates
  will be propagated to the local filesystem on all platforms.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.10 - 2020-06-22

Improvements for all users:

- We introduced a new way to store and compare local file states. This is the
  first step to solve different problems. We're solving a first issue by
  preventing fake metadata (i.e. size and content checksum) from being
  propagated to the remote Cozy when a Cozy Note is both renamed and modified
  during a very short period.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.9 - 2020-06-12

Improvements for all users:

- We made sure a Cozy Note is still identified as such after saving changes like
  an update on the remote Cozy. This will ensure they will stay protected from
  local updates afterwards.

Improvements for Windows users:

- We made sure the application of the move and update of a file on the local
  filesystem does not trigger invalid changes that would be propagated to the
  remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.8 - 2020-06-08

Improvements for all users:

- We added a migration to force a refetch of all remote Cozy Notes in order to
  avoid as many dispensable conflicts as we can during the first reboot after
  this release installation.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.7 - 2020-06-05

Improvements for all users:

- Until now the connection to your Cozy would always go through our own
  infrastructure only. We're adding the possibility for partners to offer their
  users to connect via their own SSO portal so we now run the connection flow in
  a dedicated sandbox.
  This has two advantages when an SSO portal is involved:
  1. the portal code is run in a browser like environment with no alterations so
     it should work out of the box
  2. the portal code is isolated from the rest of our application adding another
     layer of security preventing malicious code on the portal itself to access
     your computer

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.6 - 2020-06-02

Improvements for all users:

- The local Cozy Notes edit protection (i.e. notes were marked as read-only) was
  generating a new conflict every time the note was modified on the remote Cozy.
  Those conflicts originating from the change of permissions to write the new
  version, we decided to stop marking notes as read-only. The conflict mechanism
  should be enough to protect remote Cozy Notes from being broken by a local
  edit.

Improvements for Windows and Linux users:

- If a Cozy Note was moved and updated while a client was offline, the
  propagation to the local filesystem of these changes would lead to the
  creation of a conflicting markdown file and the renaming of the remote note
  with a conflict suffix.
  We made sure that applying more than one change on the same document on the
  filesystem will not lead to the detection of fake changes like the
  modification of a note.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.5 - 2020-05-25

Improvements for all users:

- The recent change we introduced to fix the propagation of remote Cozy Notes
  changes to the local filesystem brought some new timing issues. These can
  result in invalid metadata being sent to the remote Cozy after propagating an
  update. In case the note was in a shared directory, the metadata change is in
  turn propagated via the sharing to other Cozies and we can end up with a
  desynchronized note.
  This new issue comes from the fact we have to add write permissions on the
  local note file to let the client write the new markdown export. The read-only
  protection was added to prevent local changes that would break the actual note
  on the remote Cozy. Since we're now managing those changes within the
  synchronization process (i.e. with the creation of a conflict) we can remove
  the read-only limitation altogether and avoid the new timing issues.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.4 - 2020-05-19

Improvements for all users:

- Remote changes resulting in an `MergeMissingParentError` do not block the
  synchronization process since v3.21.0-beta.1 but the changes from the affected
  batch and the ones coming after will be fetched over and over again until the
  errors are resolved, which might never come.
  We've identified a few sources of those errors that should be fixed really
  soon and believe we should not encounter solvable missing parent issues
  anymore so we've decided to mark them as processed anyway and rely on the next
  changes to resolve those missing parents issues.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.3 - 2020-05-12

Improvements for all users:

- The client would not detect the correct mime type for `.cozy-note` files when
  detected on the local filesystem. This would change the saved mime type of
  notes moved on the local filesystem and not show the correct icon in the
  Recent changes list in our main window.
  We've switched to a custom mime detector for those files to detect our custom
  mime type.
- Since propagating a local file update to a remote Cozy Note would break this
  note (i.e. it would not be detected as such and we would lose its actual
  content while still keeping its markdown export within the associated Cozy
  file), we've decided to prevent all local note updates to be propagated to the
  remote Cozy.
- In order to still synchronize your local updates to notes with your remote
  Cozy, we're now using the conflict mechanism to rename the original note on
  the remote Cozy before upload your new content to the appropriate location.
  This way, you have both your updated content and the original note that can
  still be edited within the Cozy Notes application.
- We've found that when renaming a folder while another folder within the same
  parent starts with the renamed folder's original name (e.g. renaming `cozy` to
  `cozy cloud` while you have `cozy company` in the same parent) would lead to
  the incorrect movement of the content of the other folder (i.e. the content of
  `cozy compnany` in our example).
  We've fixed the algorithm that lists the content of a folder so that it looks
  only within the exact given location and not similar locations.
- In some situations, locally creating a folder within a moved or renamed parent
  could lead to the creation of a new parent folder on the remote Cozy at the
  target location, thus making the parent movement impossible since a document
  would already exist at the target location. This situation was caused by some
  logic we implemented to help create complex hierarchies in any order. We would
  create a missing parent folder when creating a new folder on the remote Cozy.
  We've now stopped doing this and will not synchronize the creation of a folder
  if its parent does not exist. In case the parent location would be created
  later by the client (e.g. when propagating the parent movement), the new
  folder will eventually be synchronized.

Improvements for Windows users:

- To emphasize the fact that Cozy Notes should not be edited on your local
  filesystem we mark the local note files as read-only. This does not prevent us
  from overwriting them with new remote updates on Linux and macOS but it does
  on Windows in some cases. In those cases, the local file content does not
  reflect the remote content anymore and it can even lead to the remote Note
  being broken after a Desktop client restart.
  We're now adding write permissions the local file when we want to update it
  with new content coming from the remote Cozy and switch it back to a read-only
  mode afterwards.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.2 - 2020-04-28

Improvements for all users:

- We missed a spot when introducing the deletion marker in the previous beta
  release which could lead to remote restorations being handled as movements if
  the previous deletion was merged into the local PouchDB database but not
  propagated to the local filesystem.
  We haven't identified visible issues coming from this yet though.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.21.0-beta.1 - 2020-04-24

Improvements for all users:

- Moving a document to an ignored location (see
  https://github.com/cozy-labs/cozy-desktop/blob/master/core/config/.cozyignore
  and your local `.cozyignore` rules file) after another move would result in
  the first move being propagated to the remote Cozy and the document being
  desynchronized after that.
  From now on, the second move to the ignored location will cancel the first
  move and the client will correctly propagate a deletion to the remote Cozy.
- Deleting a file on your Cozy while moving it on your local filesystem with
  your client stopped would lead to the desynchronisation of the file. It would
  be deleted on your Cozy but would still exist on your local filesystem and all
  later modifications would not be propagated.
  We're now refusing the deletion because we believe the movement indicates a
  desire to keep the file and it seems easier for the user to understand and fix
  the situation if that was not the expected behavior. The file move will then
  be propagated to the remote Cozy and kept in sync.
- In some situations we can detect changes made on your remote Cozy on documents
  of which we haven't yet received the parent folders. We can't process orphaned
  documents so we require the parents of all documents before we allow
  processing those and if we don't have them, we'll issue an error that results
  in the "Synchronization incomplete" status message, literally blocking the
  synchronization process.
  We believe that most of those issues could resolve themselves by merely
  refusing the orphan change and synchronizing the other changes so we've
  decided not to block the synchronization process anymore when we encounter
  orphan changes.
- We detected that the remote watcher whose role is to detect, fetch and analyze
  changes coming from your remote Cozy could fail without the synchronization
  process stopping and alerting you. This means that in such cases, the changes
  made on your local filesystem would still be detected and potentially
  propagated to your remote Cozy but the changes made remotely would not be
  applied locally until a client restart.
  We've refactored the life-cycle management of the whole synchronization
  process and the remote watcher and we made sure that errors coming from the
  remote watcher are caught by the synchronization process which will in turn
  alert you and stop itself and both local and remote watchers.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0 - 2020-04-10

Improvements for all users:

- In some situations, when moving a file or folder and overwriting an existing
  document, the local file system can fire a move event without firing a
  deletion event for the document that's being overwritten. We were very
  conservative in the way to we treat changes that could erase content so we
  would generate a conflict for those moves.
  Now that we have file versioning on the Cozy, we feel comfortable accepting
  those changes and will thus delete the overwritten document but will keep its
  existing references (e.g. photos album, bills…) and add them to the document
  being moved.
- We've found out that the synchronization process could be started more than
  once. Although this should have no effect (i.e. one start replacing the
  previous one) we've made sure we only start the process once. This should
  avoid wasting some resources in an extraneous start.
- Following some feedback on the app updater window which could give the feeling
  that the update was not going to complete, we've made a small redesign of this
  window, replacing the indeterminate progress bar with a spinner and adding
  emphasizing the text asking you to be patient until the download is complete.

Improvements for Windows and macOS users:

- To avoid synchronizing temporary documents generated by some software when
  saving a new version of a document, we maintain a list of file name patterns
  that should not be synchronized. We had some patterns for the Microsoft Office
  suite files but we did not account for temporary files generated for all the
  file types those can open like Open Documents.
  We've widened the pattern used to match those files those that all temporary
  files created by the MS Office software should be matched and thus not be
  synchronized.

Improvements for Linux and Windows users:

- During the initial scan of your local synchronization folder, we emit deletion
  events when we detect a know document is not present anymore (i.e. we assume
  you've deleted it while the client was not running). The order in which we
  emit those events is important because it will be the order in which those
  actions will be synchronized and if we try to synchronize the deletion of a
  directory before the deletion of its content, the folder will end up in your
  Cozy trash bin instead of being completely removed.
  This is not a big issue but to avoid any confusion as to why we'd put those
  files and directories in your trash, we've modified our algorithm to emit
  events for children of deleted directories before the event for the directory
  itself.

Improvements for Windows users:

- We found that in some situations, the order in which local file system events
  are received by our local changes watcher was not as expected, resulting in
  some movements not being detected as such. We would then delete the source
  documents and recreate them at the destination, losing in the process some
  important metadata like sharings.
  Our Windows movement detector is now more resilient to the order of events and
  should detect all movements as such.
- We've got reports from users experiencing app crashes. In at least some of
  those cases, the anti-virus seems to be involved.
  We've implemented some mitigations as found in the Electron documentation and
  hope to see those issues resolved.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0-beta.6 - 2020-04-09

Improvements for all users:

- The updater window was smaller than anticipated when bringing the window
  redesign to life so all the content would not fit inside, especially with
  French text. The spinner has been shrinked down to leave more room for the
  text and the French translation modified so that the first sentence would fit
  in one line.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0-beta.5 - 2020-04-09

Nothing to see here. This release let's us test the previous redesign of the updater window.

## 3.20.0-beta.4 - 2020-04-09

Improvements for all users:

- Following some feedback on the app updater window which could give the feeling
  that the update was not going to complete, we've made a small redesign of this
  window, replacing the indeterminate progress bar with a spinner and adding
  emphasizing the text asking you to be patient until the download is complete.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0-beta.3 - 2020-04-07

Improvements for all users:

- This release fixes a small typo that prevented the overwriting moves to
  function properly.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0-beta.2 - 2020-04-06

Improvements for all users:

- We've found out that the synchronization process could be started more than
  once. Although this should have no effect (i.e. one start replacing the
  previous one) we've made sure we only start the process once. This should
  avoid wasting some resources in an extraneous start.
- In some situations, when moving a file or folder and overwriting an existing
  document, the local file system can fire a move event without firing a
  deletion event for the document that's being overwritten. We were very
  conservative in the way to we treat changes that could erase content so we
  would generate a conflict for those moves.
  Now that we have file versioning on the Cozy, we feel comfortable accepting
  those changes and will thus delete the overwritten document but will keep its
  existing references (e.g. photos album, bills…) and add them to the document
  being moved.

Improvements for Windows and macOS users:

- To avoid synchronizing temporary documents generated by some software when
  saving a new version of a document, we maintain a list of file name patterns
  that should not be synchronized. We had some patterns for the Microsoft Office
  suite files but we did not account for temporary files generated for all the
  file types those can open like Open Documents.
  We've enlarged the pattern used to match those files those that all temporary
  files created by the MS Office software should be matched and thus not be
  synchronized.

Improvements for Windows users:

- We've got reports from users experiencing app crashes. In at least some of
  those cases, the anti-virus seems to be involved.
  We've implemented some mitigations as found in the Electron documentation and
  hope to see those issues resolved.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.20.0-beta.1 - 2020-03-06

Improvements for all users:

- In an attempt to avoid losing your data, we were very cautious when we
  detected movements that would overwrite documents we were aware of and would
  create a conflict document instead. There are a number of situations where
  this is not ideal because you actually wanted to overwrite this destination
  document (e.g. saving a file from an office software which uses a temporary
  file, overwriting a directory on purpose).
  With all the safeties we have in place today (i.e. trash bins on both your
  computer and your Cozy plus file versioning on your Cozy) we decided to accept
  more overwriting movements when we did not detect un-synchronized changes that
  would be overwritten by this. This should mean a lot less conflicts when using
  Microsoft Office softwares and the possibility to overwrite both files and
  directories.

Improvements for Linux and Windows users:

- During the initial scan of your local synchronization folder, we emit deletion
  events when we detect a know document is not present anymore (i.e. we assume
  you've deleted it while the client was not running). The order in which we
  emit those events is important because it will be the order in which those
  actions will be synchronized and if we try to synchronize the deletion of a
  directory before the deletion of its content, the folder will end up in your
  Cozy trash bin instead of being completely removed.
  This is not a big issue but to avoid any confusion as to why we'd put those
  files and directories in your trash, we've modified our algorithm to emit
  events for children of deleted directories before the event for the directory
  itself.

Improvements for Windows users:

- We found that in some situations, the order in which local file system events
  are received by our local changes watcher was not as expected, resulting in
  some movements not being detected as such. We would then delete the source
  documents and recreate them at the destination, losing in the process some
  important metadata like sharings.
  Our Windows movement detector is now more resilient to the order of events and
  should detect all movements as such.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.19.0 - 2020-02-25

Improvements for all users:

- We found out that revoking your device from the Connected Devices page in your
  Cozy Settings would trigger an error in the Cozy Desktop application
  preventing it from finishing the disconnection.
  From now on, when you choose to disconnect the application following the
  device revocation (i.e. choosing `Disconnect` in the modal window that shows
  up when the application detects it's been revoked) will bring you back to the
  on-boarding process so you can reconnect it if you want.
  NB: On Windows, another issue is still preventing you from disconnecting the
  application completely.
- A new Cozy Notes application was released recently, allowing you to create
  `cozy-note` documents. Those are automatically exported to a markdown format
  and stored in your Drive so that it can be synchronized with all your devices.
  Those files cannot be modified directly as it would break their format. To
  allow you to easily open and modify them we've set Cozy Desktop as the default
  application to open them. Opening a `cozy-note` file locally with Cozy Desktop
  installed (or run at least once on Linux) will open in the Cozy Notes web
  application in your browser even if it's a note that was shared with you. If
  you're not connected to the Internet or we cannot find the note on its owner's
  Cozy, we'll show its content in a downgraded rendered markdown form.
- A regression was introduced in version 3.18.0 which leads to errors when
  moving files after they've been updated. From what we've seen the
  modifications are not lost and the file ends up at the expected location but
  this could be the base for issues further down the road.
  We've made sure that the regression was fixed and added a data migration to do
  some cleanup in your local databases.

Improvements for MacOS users:

- MacOS users who synchronize a folder on an HFS+ volume could see errors by
  adding files with accentuated names via Cozy Drive Web to a folder with an
  accentuated name that was created on their local volume. This is because HFS+
  volumes automatically rename files and folders with utf-8 characters so that
  they follow the NFD norm while most of the time those are originally follow
  the NFC norm. We were expecting the whole path to follow the same norm but in
  this situation, the remotely added files were not following the same norm as
  their parent folder and we would wrongly view this as a movement.
  We're now dealing with each part of a file or folder path separately so that
  we can manage different utf-8 norms.

Improvements for Linux and Windows users:

- We found out that system errors triggered while trying to read the content of
  one of your directories during the application start would not be caught and
  would prevent the application from discovering all the files and directories
  within your synced folder and thus prevent their synchronization. This would
  also prevent the module that watches for changes on your Cozy from being
  started so we were also missing remote changes in this situation.
  We're now catching those errors and ignoring those that don't relate to the
  synced directory itself. The content of those directories will not be
  synchronized but the other directories and files will.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.19.0-beta.4 - 2020-02-20

Improvements for all users:

- We found out that revoking your device from the Connected Devices page in your
  Cozy Settings would trigger an error in the Cozy Desktop application
  preventing it from finishing the disconnection.
  From now on, when you choose to disconnect the application following the
  device revocation (i.e. choosing `Disconnect` in the modal window that shows
  up when the application detects it's been revoked) will bring you back to the
  on-boarding process so you can reconnect it if you want.
  NB: On Windows, another issue is still preventing you from disconnecting the
  application completely.

Improvements for Linux and Windows users:

- We found out that system errors triggered while trying to read the content of
  one of your directories during the application start would not be caught and
  would prevent the application from discovering all the files and directories
  within your synced folder and thus prevent their synchronization. This would
  also prevent the module that watches for changes on your Cozy from being
  started so we were also missing remote changes in this situation.
  We're now catching those errors and ignoring those that don't relate to the
  synced directory itself. The content of those directories will not be
  synchronized but the other directories and files will.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.19.0-beta.3 - 2020-02-19

Improvements for all users:

- We introduced a regression around auto-updates with the opening of notes. The
  application would not be restarted after the update was downloaded and
  installed.
  This is now fixed and updates are now fully applied again.
- On macOS, opening a note while the application was already started and syncing
  would close it and closing one of multiple markdown viewer windows would close
  all of them. Also the synchronization process would be started even when
  launching the app just to open a note.
  The behavior is now the same as on the other two OSes. Opening a note while
  the app is not started will not start the synchronization, opening it while
  the app is started will not close it and closing one markdown viewer window
  will not close all of them if more than one are opened.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.19.0-beta.2 - 2020-02-17

Improvements for all users:

- A regression was introduced in version 3.18.0 which leads to errors when
  moving files after they've been updated. From what we've seen the
  modifications are not lost and the file ends up at the expected location but
  this could be the base for issues further down the road.
  We've made sure that the regression was fixed and added a data migration to do
  some cleanup in your local databases.
- The first beta version of v3.19.0 changed the order in which we initialize the
  different parts of the application to be able to lookup notes and open them
  without starting the file synchronization process. This change unexpectedly
  prevented users to go through the on-boarding process and the end to start the
  application if the client was not already connected to their Cozy.
  We've reorganized the initial steps so that they're applied in order even when
  a client configuration does not exist yet.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.19.0-beta.1 - 2020-02-12

Improvements for all users:

- A new Cozy Notes application was released recently, allowing you to create
  `cozy-note` documents. Those are automatically exported to a markdown format
  and stored in your Drive so that it can be synchronized with all your devices.
  Those files cannot be modified directly as it would break their format. To
  allow you to easily open and modify them we've set Cozy Desktop as the default
  application to open them. Opening a `cozy-note` file locally with Cozy Desktop
  installed (or run at least once on Linux) will open in the Cozy Notes web
  application in your browser even if it's a note that was shared with you. If
  you're not connected to the Internet or we cannot find the note on its owner's
  Cozy, we'll show its content in a downgraded rendered markdown form.

Improvements for MacOS users:

- MacOS users who synchronize a folder on an HFS+ volume could see errors by
  adding files with accentuated names via Cozy Drive Web to a folder with an
  accentuated name that was created on their local volume. This is because HFS+
  volumes automatically rename files and folders with utf-8 characters so that
  they follow the NFD norm while most of the time those are originally follow
  the NFC norm. We were expecting the whole path to follow the same norm but in
  this situation, the remotely added files were not following the same norm as
  their parent folder and we would wrongly view this as a movement.
  We're now dealing with each part of a file or folder path separately so that
  we can manage different utf-8 norms.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.18.0 - 2020-01-17

Improvements for all users:

- We've completely changed our sorting algorithm for changes coming from the
  Cozy. We may not receive changes in the order they were made and this can make
  their application on the local file system impossible. To mitigate this
  situation we sort the changes to make their application possible. It is a
  difficult task and we've made a lot of changes in the past to try and fix bugs
  in different situations.
  We've yet again seen new problematic situations recently and decided to try a
  new approach with a completely new algorithm, focusing more on essential
  changes that need to happen first rather than trying to recreate the very
  specific order in which changes were made.
- We've noticed that when requesting a manual synchronization, the button is not
  disabled right away but only when the synchronization actually starts. This
  means that, in the meantime, you can potentially click multiple times on the
  button (e.g. you think that your request was not taken into account) thus
  piling up synchronization requests.
  We believe that multiple synchronization requests can lead to unexpected
  behavior and have decided to disable the button right after your click so
  we'll be sure only one request will be made until the requested
  synchronization is complete.
- Since the introduction of the new Cozy Notes application, we've started
  synchronizing `.cozy-note` files with Cozy Desktop. Those files contain a
  markdown export of your Notes, written using the remote application. Those
  files are not meant to be modified as they're only exports. They only exist so
  you can read them without going to the remote application and later as an
  entrypoint to the application.
  As a hint, we've decided to make those files read-only so you will be less
  likely to modify them outside the Cozy Notes application and thus possibly
  lose content.
- As a follow-up to the manual synchronization button changes, we've worked on
  the underlying synchronization stop requests to make sure every component
  involved in the synchronization process is stopped prior to starting a new
  process.
  This means that we should not see problems coming from manual synchronizations
  anymore but also that some actions that involve stopping or deleting the
  PouchDB database will wait for the completion of the current synchronization
  and thus may take longer. This does not affect stopping the client.
- We've found out that some remote file updates (i.e. pushed by another client)
  may be lost during a client restart (actually they can now be recovered via
  the versions management) if they were detected by the client but not
  propagated to the file system prior to the restart. In this situation, the
  file was renamed with a `-conflict-…` suffix and its local version was pushed
  to the Cozy thus overwriting the remote update.
  We've decided to keep the remote changes in this situation and forcibly
  propagate it to the local file system. Since there could be a legitimate file
  update on the file system as well, we'll create a backup copy of the local
  file before overwriting it. This backup copy will have the `.bck` extension
  and will be trashed for a cleaner experience.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.18.0-beta.2 - 2020-01-15

Improvements for all users:

- As a follow-up to the manual synchronization button changes, we've worked on
  the underlying synchronization stop requests to make sure every component
  involved in the synchronization process is stopped prior to starting a new
  process.
  This means that we should not see problems coming from manual synchronizations
  anymore but also that some actions that involve stopping or deleting the
  PouchDB database will wait for the completion of the current synchronization
  and thus may take longer. This does not affect stopping the client.
- We've found out that some remote file updates (i.e. pushed by another client)
  may be lost during a client restart (actually they can now be recovered via
  the versions management) if they were detected by the client but not
  propagated to the file system prior to the restart. In this situation, the
  file was renamed with a `-conflict-…` suffix and its local version was pushed
  to the Cozy thus overwriting the remote update.
  We've decided to keep the remote changes in this situation and forcibly
  propagate it to the local file system. Since there could be a legitimate file
  update on the file system as well, we'll create a backup copy of the local
  file before overwriting it. This backup copy will have the `.bck` extension
  and will be trashed for a cleaner experience.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.18.0-beta.1 - 2020-01-02

Improvements for all users:

- We've completely changed our sorting algorithm for changes coming from the
  Cozy. We may not receive changes in the order they were made and this can make
  their application on the local file system impossible. To mitigate this
  situation we sort the changes to make their application possible. It is a
  difficult task and we've made a lot of changes in the past to try and fix bugs
  in different situations.
  We've yet again seen new problematic situations recently and decided to try a
  new approach with a completely new algorithm, focusing more on essential
  changes that need to happen first rather than trying to recreate the very
  specific order in which changes were made.
- We've noticed that when requesting a manual synchronization, the button is not
  disabled right away but only when the synchronization actually starts. This
  means that, in the meantime, you can potentially click multiple times on the
  button (e.g. you think that your request was not taken into account) thus
  piling up synchronization requests.
  We believe that multiple synchronization requests can lead to unexpected
  behavior and have decided to disable the button right after your click so
  we'll be sure only one request will be made until the requested
  synchronization is complete.
- Since the introduction of the new Cozy Notes application, we've started
  synchronizing `.cozy-note` files with Cozy Desktop. Those files contain a
  markdown export of your Notes, written using the remote application. Those
  files are not meant to be modified as they're only exports. They only exist so
  you can read them without going to the remote application and later as an
  entrypoint to the application.
  As a hint, we've decided to make those files read-only so you will be less
  likely to modify them outside the Cozy Notes application and thus possibly
  lose content.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.17.0 - 2019-12-16

Improvements for all users:

- Merging multiple changes at once often requires that they are in the correct
  order (i.e. the order in which they were made) or we might not be able to
  merge some of them. We don't always get those changes in the correct order
  from the Cozy and this can block the synchronization although we have all the
  required changes in the list.
  We introduced a retry mechanism in this part of the application that will put
  any change that we failed to merge at the end of the list so we can retry
  after we've merged the others and thus potentially unlock the situation.
- We found out that errors while downloading a file from the remote Cozy (mostly
  network errors which are quite common) were not handled at all. The result was
  that the synchronization was stopped without notice (not even an error message
  in the status bar) and would only work again after restarting the application.
  We now catch them so the synchronization won't get completely blocked, we'll
  wait for an internet connection to come back in the event of network errors
  and we'll try downloading the file up to 3 times before giving up.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.17.0-beta.2 - 2019-12-13

Improvements for all users:

- We found out that errors while downloading a file from the remote Cozy (mostly
  network errors which are quite common) were not handled at all. The result was
  that the synchronization was stopped without notice (not even an error message
  in the status bar) and would only work again after restarting the application.
  We now catch them so the synchronization won't get completely blocked, we'll
  wait for an internet connection to come back in the event of network errors
  and we'll try downloading the file up to 3 times before giving up.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.17.0-beta.1 - 2019-12-10

Improvements for all users:

- Merging multiple changes at once often requires that they are in the correct
  order (i.e. the order in which they were made) or we might not be able to
  merge some of them. We don't always get those changes in the correct order
  from the Cozy and this can block the synchronization although we have all the
  required changes in the list.
  We introduced a retry mechanism in this part of the application that will put
  any change that we failed to merge at the end of the list so we can retry
  after we've merged the others and thus potentially unlock the situation.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.2 - 2019-11-25

Improvements for all users:

- In some situations like unsigned Terms of Service, requests to the remote Cozy
  will result in errors and the synchronization will fail. To anticipate those,
  we have a poller that requests from the Cozy required user actions and that
  turns them into alerts that Cozy Desktop will show you. A technical error in
  the poller resulted in failure to schedule polls past the first one and you
  would miss those very precious information unless you would restart the
  application.
  You should now be shown those alerts as early as possible without restarting
  the application thus enabling you to anticipate synchronization errors.
- With version 3.16.1 of the app, we decided to increase the visibility of the
  synchronization activity especially during the upload of large files or the
  preparation of local changes. This made the application's status and icon
  "blink" for some users and would give a bad feeling about its behavior.
  We made some more changes to the status display so you should now see no
  blinking and better delimited activity phases that should better reflect the
  ongoing synchronization.
- We use a local Pouch database to keep track of all documents and their
  metadata. Part of this metadata are the remote identifier of each document on
  the Cozy and its last known revision. Whenever we make a change on a document,
  we fetch its previous version from the local Pouch database so we can access
  its old metadata. When the change happened locally, we pass along to the Cozy
  this old metadata's remote revision so it can validate we're not overwriting a
  document that was changed on the Cozy without our knowledge. It appears we
  made a mistake in the order old revisions are returned to us by Pouch and that
  we were not always fetching previous revision but usually the second known
  revision. This would mean local changes on the document would not get
  propagated to the remote Cozy.
  We fixed this revision selection which should avoid quite a lot of propagation
  issues and further down the road conflicts as well.
- We found out that if you encountered a network timeout during the release
  availability check, we would stop alerting you whenever a new release is
  available unless you'd restart the app.
  We're now making sure that each successful availability check (we're running
  a check every 24 hours) we'll offer you to install any update.
- In case you encounter an error such as a synchronization error, we're now
  making sure you'll get notified only once and not every time you open the
  application window.
- If you look at the Settings application on your Cozy, you will list is
  Connected Devices tab. This page lists all clients that were ever connected to
  your Cozy and were not revoked. This page also tells you when each client was
  synchronized for the last time. Unfortunately, the Desktop client was not
  updating this date so you would only see its device name.
  We're now updating this date each time the app reaches the up-to-date status,
  be there any changes to sync or not.

Improvements for Windows and GNU/Linux users:

- The library we use to watch for changes on the local filesystem, Atom Watcher,
  can sometimes generate events without a document type for deletions. In those
  situations we had decided to force the type to `file` but this would lead to
  type mismatches when a directory was deleted.
  When the event type is unknown, we're now looking into the local Pouch
  database for an existing document at the deleted path and if one does exist,
  we use its type. If we can't find any existing document, we resort back to
  forcing the type to `file` as we don't have any mean to detect the actual type
  (i.e. the file or directory does not exist anymore so we can't request stats
  from the filesystem).

Improvements for Windows users:

- We found out that when applying on the local filesystem a file modification
  from the Cozy, a rename event was generated from the file path to itself, thus
  firing an `Invalid move` error.
  While we have no indications that this would have any impact on your usage,
  we've made sure this event is not generated anymore.
- We introduced in Cozy Desktop v3.13.1 a mechanism to identify files and
  directories with more precision on Windows. This required to modify every
  single document in the local Pouch database to make sure the new identifier
  was saved and could be used (e.g. in movement detection). While this worked
  for most documents, users who had local unsynchronized documents when this
  migration took place, ended up with an unsyncable version of those which could
  not be fixed.
  Fortunately, those versions were not actually saved in the database and we
  could fix the migration itself so those documents will get their precise
  identifier and will be synchronized from now on.

Improvements for GNU/Linux users:

- Since the v3.16.0 and the Electron update to v5, the Chromium sandbox is
  activated by default and since it requires kernel features that are disabled
  by default in Debian issued kernels, users of those kernels could not start
  the application without using the `--no-sandbox` flag. This would mean either
  launching the app from the command line or modifying the `.desktop` file used
  as a shortcut.
  We found a way to detect when the kernel feature is disabled and apply the
  `--no-sandbox` flag in those situations without any actions from the user.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.2-beta.4 - 2019-11-22

Improvements for all users:

- We found out that if you encountered a network timeout during the release
  availability check, we would stop alerting you whenever a new release is
  available unless you'd restart the app.
  We're now making sure that each successful availability check (we're running
  a check every 24 hours) we'll offer you to install any update.
- In case you encounter an error such as a synchronization error, we're now
  making sure you'll get notified only once and not every time you open the
  application window.
- If you look at the Settings application on your Cozy, you will list is
  Connected Devices tab. This page lists all clients that were ever connected to
  your Cozy and were not revoked. This page also tells you when each client was
  synchronized for the last time. Unfortunately, the Desktop client was not
  updating this date so you would only see its device name.
  We're now updating this date each time the app reaches the up-to-date status,
  be there any changes to sync or not.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.2-beta.3 - 2019-11-20

Improvements for all users:

- We use a local Pouch database to keep track of all documents and their
  metadata. Part of this metadata are the remote identifier of each document on
  the Cozy and its last known revision. Whenever we make a change on a document,
  we fetch its previous version from the local Pouch database so we can access
  its old metadata. When the change happened locally, we pass along to the Cozy
  this old metadata's remote revision so it can validate we're not overwriting a
  document that was changed on the Cozy without our knowledge. It appears we
  made a mistake in the order old revisions are returned to us by Pouch and that
  we were not always fetching previous revision but usually the second known
  revision. This would mean local changes on the document would not get
  propagated to the remote Cozy.
  We fixed this revision selection which should avoid quite a lot of propagation
  issues and further down the road conflicts as well.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.2-beta.2 - 2019-11-19

Improvements for all users:

- With version 3.16.1 of the app, we decided to increase the visibility of the
  synchronization activity especially during the upload of large files or the
  preparation of local changes. This made the application's status and icon
  "blink" for some users and would give a bad feeling about its behavior.
  We made some more changes to the status display so you should now see no
  blinking and better delimited activity phases that should better reflect the
  ongoing synchronization.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.2-beta.1 - 2019-11-15

Improvements for all users:

- In some situations like unsigned Terms of Service, requests to the remote Cozy
  will result in errors and the synchronization will fail. To anticipate those,
  we have a poller that requests from the Cozy required user actions and that
  turns them into alerts that Cozy Desktop will show you. A technical error in
  the poller resulted in failure to schedule polls past the first one and you
  would miss those very precious information unless you would restart the
  application.
  You should now be shown those alerts as early as possible without restarting
  the application thus enabling you to anticipate synchronization errors.

Improvements for Windows and GNU/Linux users:

- The library we use to watch for changes on the local filesystem, Atom Watcher,
  can sometimes generate events without a document type for deletions. In those
  situations we had decided to force the type to `file` but this would lead to
  type mismatches when a directory was deleted.
  When the event type is unknown, we're now looking into the local Pouch
  database for an existing document at the deleted path and if one does exist,
  we use its type. If we can't find any existing document, we resort back to
  forcing the type to `file` as we don't have any mean to detect the actual type
  (i.e. the file or directory does not exist anymore so we can't request stats
  from the filesystem).

Improvements for Windows users:

- We found out that when applying on the local filesystem a file modification
  from the Cozy, a rename event was generated from the file path to itself, thus
  firing an `Invalid move` error.
  While we have no indications that this would have any impact on your usage,
  we've made sure this event is not generated anymore.
- We introduced in Cozy Desktop v3.13.1 a mechanism to identify files and
  directories with more precision on Windows. This required to modify every
  single document in the local Pouch database to make sure the new identifier
  was saved and could be used (e.g. in movement detection). While this worked
  for most documents, users who had local unsynchronized documents when this
  migration took place, ended up with an unsyncable version of those which could
  not be fixed.
  Fortunately, those versions were not actually saved in the database and we
  could fix the migration itself so those documents will get their precise
  identifier and will be synchronized from now on.

Improvements for GNU/Linux users:

- Since the v3.16.0 and the Electron update to v5, the Chromium sandbox is
  activated by default and since it requires kernel features that are disabled
  by default in Debian issued kernels, users of those kernels could not start
  the application without using the `--no-sandbox` flag. This would mean either
  launching the app from the command line or modifying the `.desktop` file used
  as a shortcut.
  We found a way to detect when the kernel feature is disabled and apply the
  `--no-sandbox` flag in those situations without any actions from the user.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.1 - 2019-11-08

Improvements for all users:

- We use a monitoring system (hosted on our own infrastructure) to receive
  reports of errors happening when you use Cozy Desktop. This system requires a
  client to be setup in our app to send those reports to the server. We used an
  older version of that client which stopped working when we upgraded Electron
  in the previous version and that lead to app crashes whenever we tried to send
  a report.
  We've migrated to the latest version of that client so you shouldn't
  experience those crashes anymore and we'll even get a bit more of information
  in each report which might help us help you.
- We have detected that in some very specific situations, the app can enter a
  local loop of conflict renaming on one or more documents. Those loops would
  prevent your document to be synchronized with the remote Cozy or for it to be
  continuously renamed and, in the most extreme cases, lead to app crashes on
  start-up due to the size of the document (each conflict renaming would
  increase its size).
  One of those situations is the presence of more than one document in our
  database with the same unique filesystem identifier, resulting from the
  mis-interpretation of some filesystem events. We've taken some steps to
  prevent the presence of those 2 documents at the same time, not preventing
  possible future conflicts on the sole document left but preventing a conflict
  loop to start from there.
- For those of you who have already experienced extreme local conflict loops and
  can't get the app to start without crashing, we have re-evaluated our strategy
  to load all the existing documents during start-up so their size would not
  matter and the app keep working.
- We have decided to reassess how we compute the application state and how we
  communicate it, especially via the systray icon, so that you're more aware of
  its activities. This is notably true for the upload of large files during
  which the spinner would stop and the app would state it is up-to-date while
  the upload is actually not finished and shutting done the application would
  cancel it.

Improvements for Windows users:

- We brought back the systray icon contextual menu (i.e. the one showing up on
  right-clicks) mistakenly removed in a previous version, meaning you would have
  to open the app window and use the button in the Preferences tab to shut it
  down.
- The library used to package our binaries changed the format of the created
  Uninstall Windows registry subkey without cleaning up old keys when updating
  the application. This means that Windows users updating from a version prior
  to v3.16.0 to v3.16.0 will have 2 Cozy Drive applications listed in the
  Windows programs manager and uninstalling the old version will actually
  uninstall the most recent and leave them with a Cozy Drive version seemingly
  seemingly impossible to uninstall.
  We added some cleanup logic to Cozy Drive to take care of removing the old
  registry subkey automatically.

Improvements for GNU/Linux users:

- On Linux, every time you updated the application, you had to re-enable
  auto-launch if it was previously enabled because the auto-launch entry
  contained the application's version and would not match the new version.
  We've changed the entry's name to just `Cozy-Desktop` so all versions will
  match and the auto-launch will stay enabled after an update.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.1-beta.4 - 2019-11-08

Improvements for GNU/Linux users:

- On Linux, every time you updated the application, you had to re-enable
  auto-launch if it was previously enabled because the auto-launch entry
  contained the application's version and would not match the new version.
  We've changed the entry's name to just `Cozy-Desktop` so all versions will
  match and the auto-launch will stay enabled after an update.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.1-beta.3 - 2019-11-06

Improvements for Windows users:

- Files within the app's asar archive are not accessible at runtime while the
  library we use to modify the Windows registry loads `.vbs` files to execute
  the modifications.
  We've bypassed this limitation by copying the `.vbs` files to the app's
  `resources` folder and telling the library where to find them for our registry
  modifications to work.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.1-beta.2 - 2019-11-06

Improvements for Windows users:

- The library used to package our binaries changed the format of the created
  Uninstall Windows registry subkey without cleaning up old keys when updating
  the application. This means that Windows users updating from a version prior
  to v3.16.0 to v3.16.0 will have 2 Cozy Drive applications listed in the
  Windows programs manager and uninstalling the old version will actually
  uninstall the most recent and leave them with a seemingly un-uninstallable
  Cozy Drive version.
  We added some cleanup logic to Cozy Drive to take care of removing the old
  registry subkey automatically.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.1-beta.1 - 2019-11-05

Improvements for all users:

- We use a monitoring system (hosted on our own infrastructure) to receive
  reports of errors happening when you use Cozy Desktop. This system requires a
  client to be setup in our app to send those reports to the server. We used an
  older version of that client which stopped working when we upgraded Electron
  in the previous version and that lead to app crashes whenever we tried to send
  a report.
  We've migrated to the latest version of that client so you shouldn't
  experience those crashes anymore and we'll even get a bit more of information
  in each report which might help us help you.
- We have detected that in some very specific situations, the app can enter a
  local loop of conflict renaming on one or more documents. Those loops would
  prevent your document to be synchronized with the remote Cozy or for it to be
  continuously renamed and, in the most extreme cases, lead to app crashes on
  start-up due to the size of the document (each conflict renaming would
  increase its size).
  One of those situations is the presence of more than one document in our
  database with the same unique filesystem identifier, resulting from the
  mis-interpretation of some filesystem events. We've taken some steps to
  prevent the presence of those 2 documents at the same time, not preventing
  possible future conflicts on the sole document left but preventing a conflict
  loop to start from there.
- For those of you who have already experienced extreme local conflict loops and
  can't get the app to start without crashing, we have re-evaluated our strategy
  to load all the existing documents during start-up so their size would not
  matter and the app keep working.
- We have decided to reassess how we compute the application state and how we
  communicate it, especially via the systray icon, so that you're more aware of
  its activities. This is notably true for the upload of large files during
  which the spinner would stop and the app would state it is up-to-date while
  the upload is actually not finished and shutting done the application would
  cancel it.

Improvements for Windows users:

- We brought back the systray icon contextual menu (i.e. the one showing up on
  right-clicks) mistakenly removed in a previous version, meaning you would have
  to open the app window and use the button in the Preferences tab to shut it
  down.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0 - 2019-10-24

Improvements for all users:

- We upgraded a lot of dependencies and especially Electron which was upgraded
  to v5.0.0. This brings in Node v12.0.0. They should bring performance and
  stability improvements.
- We improved the stability of the ordering and identification of changes
  fetched from the remote Cozy. This should reduce the number of unmergeable
  changes and conflicts arising from those situations. This is especially true
  when complex moves were synchronised with the remote Cozy (e.g. moving a
  folder from inside a moved folder).
- We fixed a few minor UI issues like long filenames which were not correctly
  ellipsized in the synced files list.
- When upgrading Electron to v5.0.0, we broke the onboarding process because of
  a new security restriction in Chromium (which is packaged with Electron)
  preventing us from redirecting to the folder selection window after connecting
  to your Cozy and authorizing the Cozy Desktop app.
  The redirection is now handled differently to avoid the security issue and
  load the folder selection window.
- Our remote changes watcher tries to recreate the changes that were executed
  on the remote Cozy from the resulting documents and the old versions we have
  locally. We found out that we were not correctly detecting and thus handling
  complex hierarchy changes like:
  * child only moves (i.e. we detect a move on a folder descendant which is due
    to its ancestor move and should not result in any local action)
  * moves inside move (i.e. renaming/moving the child of a moved parent within
    that same parent)
  * moves from inside a move (i.e. moving the child of a moved parent outside
    that parent)
  Handling those changes correctly should result in a lot less unmerged changes
  and their consequences.
- After fixing the remote changes identification logic, we found out that our
  sorting algorithm (necessary to avoid potential collisions when applying them
  locally) was not stable and the resulting order depended greatly on the
  original changes and their order.
  We separated the criterias on which we sort the changes to come up with 2
  sorting algorithms called on after the other so the result of each one is
  predictable and thus the end result too. This should prevent some conflicts
  and mis-applied changes.

Improvements for MacOS users:

- In an attempt to prevent losing a working config, we decided to use a write
  technique called copy-on-write. This proved itself unnecessary and even lead
  to issues for some users when they had both a working config and a temporary
  config file. We stopped using this technique without losing the safety of an
  atomic write via a temporary config file.
- When launching the application, we do what we call an initial scan of your
  synced directory to list all its documents and try to detect changes that were
  made since the last time the application was running. It is a complex task
  which does not behave in the same way the live watching does and we were not
  always ordering the resulting changes in the correct order, resulting in
  incorrect changes or unmerged changes. We designed a specific sorting
  algorithm for this phase to stabilize this situation which should result in
  less errors during the application startup.
- Apple now requires a notarization step for apps to be installed on newer
  versions of macOS. With this process, Apple certifies that Cozy Desktop
  does not contain any known malware and macOS will let you install our app
  without having to tinkle with your security parameters.
- The way we store documents metadata (e.g. their paths) means we have to modify
  the saved metadata of the moved folder itself but also all its descendants
  (i.e. so their paths in our database reflects their path on the filesystem).
  We found an issue in our moves handling logic that prevented us from detecting
  moves from inside a move (i.e. we move a folder to another location from a
  parent that was just moved as well).
  We're now detecting them correctly which means those changes will now be
  propagated to the remote Cozy as expected.
- We found out that the libraries we use to watch the changes done to your files
  on your filesystem could sometimes fire events with the wrong type. Indeed,
  we've seen events for the addition of files with a directory type and
  vice-versa.
  We rely on this type to decide which actions to run so we're now verifying
  that the type we received is correct before we proceed.

Improvements for GNU/Linux users:

- Upgrading Electron, the desktop applications framework upon which Cozy Desktop
  is built, means upgrading the Node and Chromium versions shipped with it.
  Starting with Electron v4, when libappindicator is available and installed on
  your distribution, the systray icon will be displayed via this library. This
  means that the icon won't respond to left clicks anymore. To mitigate this
  situation, we decided to add the "Show Application" menu entry in the context
  menu for all distributions. This context menu can be displayed via a right
  click on the systray icon.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.6 - 2019-10-24

Improvements for all users:

- When you send a message to our support via the application, we also securely
  send your last log file to one of our servers for analysis so we can better
  identify the issues you might be facing. When we upgraded Electron, the
  expected configuration of this request has changed and the log file would not
  be sent anymore.
  We've updated this configuration and log files are joined to your message
  again.

Improvements for MacOS users:

- We found out that the libraries we use to watch the changes done to your files
  on your filesystem could sometimes fire events with the wrong type. Indeed,
  we've seen events for the addition of files with a directory type and
  vice-versa.
  We rely on this type to decide which actions to run so we're now verifying
  that the type we received is correct before we proceed.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.5 - 2019-10-22

Improvements for all users:

- After fixing the remote changes identification logic, we found out that our
  sorting algorithm (necessary to avoid potential collisions when applying them
  locally) was not stable and the resulting order depended greatly on the
  original changes and their order.
  We separated the criterias on which we sort the changes to come up with 2
  sorting algorithms called on after the other so the result of each one is
  predictable and thus the end result too. This should prevent some conflicts
  and mis-applied changes.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.4 - 2019-10-21

Improvements for all users:

- When upgrading Electron to v5.0.0, we broke the onboarding process because of
  a new security restriction in Chromium (which is packaged with Electron)
  preventing us from redirecting to the folder selection window after connecting
  to your Cozy and authorizing the Cozy Desktop app.
  The redirection is now handled differently to avoid the security issue and
  load the folder selection window.
- Our remote changes watcher tries to recreate the changes that were executed
  on the remote Cozy from the resulting documents and the old versions we have
  locally. We found out that we were not correctly detecting and thus handling
  complex hierarchy changes like:
  * child only moves (i.e. we detect a move on a folder descendant which is due
    to its ancestor move and should not result in any local action)
  * moves inside move (i.e. renaming/moving the child of a moved parent within
    that same parent)
  * moves from inside a move (i.e. moving the child of a moved parent outside
    that parent)
  Handling those changes correctly should result in a lot less unmerged changes
  and their consequences.

Improvements for MacOS users:

- With the new Apple notarization process, we need to specify which OS
  permissions will be required and requested by our app. By default, apps are
  not allowed to load code frameworks that were not signed by the same team ID
  or by Apple itself.
  Since we use the Electron framework which is not signed by us or Apple, we
  need to disable circumvent this restriction or the app won't start.
- The way we store documents metadata (e.g. their paths) means we have to modify
  the saved metadata of the moved folder itself but also all its descendants
  (i.e. so their paths in our database reflects their path on the filesystem).
  We found an issue in our moves handling logic that prevented us from detecting
  moves from inside a move (i.e. we move a folder to another location from a
  parent that was just moved as well).
  We're now detecting them correctly which means those changes will now be
  propagated to the remote Cozy as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.3 - 2019-10-18

Improvements for MacOS users:

- Apple now requires a notarization step for apps to be installed on newer
  versions of macOS. With this process, Apple certifies that Cozy Desktop
  does not contain any known malware and macOS will let you install our app
  without having to tinkle with your security parameters.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.2 - 2019-10-16

Improvements for all users:

- We fixed a technical error with one of our dependencies which prevented the
  app from starting.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.16.0-beta.1 - 2019-10-16

Improvements for all users:

- We upgraded a lot of dependencies and especially Electron which was upgraded
  to v5.0.0. This brings in Node v12.0.0. They should bring performance and
  stability improvements.
- We improved the stability of the ordering and identification of changes
  fetched from the remote Cozy. This should reduce the number of unmergeable
  changes and conflicts arising from those situations. This is especially true
  when complex moves were synchronised with the remote Cozy (e.g. moving a
  folder from inside a moved folder).
- We fixed a few minor UI issues like long filenames which were not correctly
  ellipsized in the synced files list.

Improvements for MacOS users:

- In an attempt to prevent losing a working config, we decided to use a write
  technique called copy-on-write. This proved itself unnecessary and even lead
  to issues for some users when they had both a working config and a temporary
  config file. We stopped using this technique without losing the safety of an
  atomic write via a temporary config file.
- When launching the application, we do what we call an initial scan of your
  synced directory to list all its documents and try to detect changes that were
  made since the last time the application was running. It is a complex task
  which does not behave in the same way the live watching does and we were not
  always ordering the resulting changes in the correct order, resulting in
  incorrect changes or unmerged changes. We designed a specific sorting
  algorithm for this phase to stabilize this situation which should result in
  less errors during the application startup.

Improvements for GNU/Linux users:

- Upgrading Electron, the desktop applications framework upon which Cozy Desktop
  is built, means upgrading the Node and Chromium versions shipped with it.
  Starting with Electron v4, when libappindicator is available and installed on
  your distribution, the systray icon will be displayed via this library. This
  means that the icon won't respond to left clicks anymore. To mitigate this
  situation, we decided to add the "Show Application" menu entry in the context
  menu for all distributions. This context menu can be displayed via a right
  click on the systray icon.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.2 - 2019-09-16

Improvements for all users:

- When moving or renaming directories and subdirectories on your remote Cozy
  pretty quickly or with your Desktop client turned off, we would detect all
  moves but would end up dropping the moves of children directories of moved
  directories. This would lead to unsynchronized directories.
  We're now treating them the same way we do for children file movements and
  keep them synchronized.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.2-beta.1 - 2019-09-12

Improvements for all users:

- When moving or renaming directories and subdirectories on your remote Cozy
  pretty quickly or with your Desktop client turned off, we would detect all
  moves but would end up dropping the moves of children directories of moved
  directories. This would lead to unsynchronized directories.
  We're now treating them the same way we do for children file movements and
  keep them synchronized.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.1 - 2019-09-09

Improvements for all users:

- In some situations, like when a large quantity of data is synchronized with
  the remote Cozy, adding a directory and then renaming it before we had a
  chance to synchronize it would result in a error and that directory (and by
  extension, its content) would never get synchronized.
  We're now correctly handling this situation, like we were already doing for
  files, by treating this directory renaming as a simple addition of the
  directory at its most recent location.

Improvements for MacOS users:

- The UTF-8 encoding fix we shipped in the previous release was missing a
  crucial step when re-encoding `NFD` paths with `NFC` which lead to the
  creation of conflicts on accentuated paths for users synchronizing a directory
  placed on a HFS+ volume.
  In response, we've changed the way we attack this problem and decided to keep
  paths in the encoding they were created with in Pouch and manage the mapping
  with the filesystem only.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.1-beta.2 - 2019-09-06

Improvements for all users:

- In some situations, like when a large quantity of data is synchronized with
  the remote Cozy, adding a directory and then renaming it before we had a
  chance to synchronize it would result in a error and that directory (and by
  extension, its content) would never get synchronized.
  We're now correctly handling this situation, like we were already doing for
  files, by treating this directory renaming as a simple addition of the
  directory at its most recent location.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.1-beta.1 - 2019-09-05

Improvements for MacOS users:

- The UTF-8 encoding fix we shipped in the previous release was missing a
  crucial step when re-encoding `NFD` paths with `NFC` which lead to the
  creation of conflicts on accentuated paths for users synchronizing a directory
  placed on a HFS+ volume.
  In response, we've changed the way we attack this problem and decided to keep
  paths in the encoding they were created with in Pouch and manage the mapping
  with the filesystem only.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.0 - 2019-28-08

Improvements for all users:

- Replacing a file on the remote Cozy with a new version without overriding the
  previous one (i.e. moving/deleting the first version before uploading the new
  one) while the client was off would lead to a conflict on said file.
  The client now synchronises the file replacement correctly.
- When handling a conflict on a document whose ancestor was already in conflict
  would lead to the ancestor's conflict suffix to be replaced instead of a
  conflict suffix to be added on the document itself. This would make detecting
  and fixing conflicts difficult for you. We've made our conflict resolution
  logic more robust to avoid those situations in the future.
- Due to the way we used to decide on which side changes should be applied
  (i.e. either on the local filesystem or the remote Cozy), some successive
  changes made on both sides could lead to blockage on the modified documents.
  One such situation is the addition of a document in a directory while the
  client is on but shut down before the document is synchronised with the remote
  Cozy followed by the renaming of the parent directory on the remote Cozy. In
  this case, the renaming could not be synchronised locally and the new document
  would never be pushed to the remote Cozy.
  We've made some changes to this logic so we can be more precise in the side
  detection and manage specific situations such as the one above on a case by
  case basis.
- We're now able to use Two Factor Authentication when connecting the client to
  the remote Cozy if it's been activated. Activating the 2FA after connecting
  the client was already working and if you are in this situation, you have
  nothing to do.

Improvements for MacOS users:

- We know that HFS+ volumes are using a different UTF-8 encoding norm for paths
  that the one we use on the remote Cozy (i.e. `NFD` and `NFC` respectively) but
  we've found out that paths containing UTF-8 characters encoded with `NFC`
  written to such volumes would get automatically renamed into their `NFD`
  counterpart, leading to extraneous renaming on the remote Cozy. In most cases
  this would not be an issue but when the renamed directory is `Partages reçus`,
  the French version of the received shared documents, this can lead to
  conflicts and even ignored sharings.
  To prevent those bad situations from happenning, we're now only keeping `NFC`
  versions of the document paths in our local Pouch and normalizing all paths
  from local events using `NFC` so they can be compared with the ones in Pouch.
  This means that local normalization changes won't be synchronised with the
  remote Cozy but will be left untouched on the filesystem.

Improvements for GNU/Linux users:

- We've made sure that the app is really launched minimized in the systray and
  that no transparent windows are displayed on startup anymore.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.15.0-beta.1 - 2019-28-08

Improvements for all users:

- Replacing a file on the remote Cozy with a new version without overriding the
  previous one (i.e. moving/deleting the first version before uploading the new
  one) while the client was off would lead to a conflict on said file.
  The client now synchronises the file replacement correctly.
- When handling a conflict on a document whose ancestor was already in conflict
  would lead to the ancestor's conflict suffix to be replaced instead of a
  conflict suffix to be added on the document itself. This would make detecting
  and fixing conflicts difficult for you. We've made our conflict resolution
  logic more robust to avoid those situations in the future.
- Due to the way we used to decide on which side changes should be applied
  (i.e. either on the local filesystem or the remote Cozy), some successive
  changes made on both sides could lead to blockage on the modified documents.
  One such situation is the addition of a document in a directory while the
  client is on but shut down before the document is synchronised with the remote
  Cozy followed by the renaming of the parent directory on the remote Cozy. In
  this case, the renaming could not be synchronised locally and the new document
  would never be pushed to the remote Cozy.
  We've made some changes to this logic so we can be more precise in the side
  detection and manage specific situations such as the one above on a case by
  case basis.
- We're now able to use Two Factor Authentication when connecting the client to
  the remote Cozy if it's been activated. Activating the 2FA after connecting
  the client was already working and if you are in this situation, you have
  nothing to do.

Improvements for MacOS users:

- We know that HFS+ volumes are using a different UTF-8 encoding norm for paths
  that the one we use on the remote Cozy (i.e. `NFD` and `NFC` respectively) but
  we've found out that paths containing UTF-8 characters encoded with `NFC`
  written to such volumes would get automatically renamed into their `NFD`
  counterpart, leading to extraneous renaming on the remote Cozy. In most cases
  this would not be an issue but when the renamed directory is `Partages reçus`,
  the French version of the received shared documents, this can lead to
  conflicts and even ignored sharings.
  To prevent those bad situations from happenning, we're now only keeping `NFC`
  versions of the document paths in our local Pouch and normalizing all paths
  from local events using `NFC` so they can be compared with the ones in Pouch.
  This means that local normalization changes won't be synchronised with the
  remote Cozy but will be left untouched on the filesystem.

Improvements for GNU/Linux users:

- We've made sure that the app is really launched minimized in the systray and
  that no transparent windows are displayed on startup anymore.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.14.0 - 2019-07-01

Improvements for all users:

- In case your client enters an error state, the manual synchronisation button
  will now display is normal label instead of the error label which is already
  display in the window's top bar.
- We fixed an issue with conflicting document names in the previous version but
  introduced in the process a bug with files without extensions. If we detected
  a conflict on a file without extensions that already had the conflict suffix,
  we would use the milliseconds part of the previous conflict suffix as the new
  file extension. We're now correctly handling conflict suffixes replacement
  for all types of documents, with or without extensions.
- We recently tried to reduce the error kinds that would lead to a
  "No Internet connection" status to network errors only and introduced a new
  "Synchronization incomplete" status for cases where one or several of yours
  documents could not be synchronised but some could.
  However, we discovered the network errors we're getting from the remote Cozy
  don't have the shape we expected and were detected as synchronisation errors
  thus displaying the "Synchronization incomplete" status. All network errors
  are now correctly detected and handled as "No Internet connection" errors
  with a retry every second until the connection to your Cozy is back.
- We took this opportunity to handle PouchDB errors thrown when a file or
  directory name starts with an `_` (i.e. those are reserved PouchDB words) as a
  synchronisation error instead of a network error.

Improvements for MacOS users:

- We were forbidding the usage of the `:` character in folder and file names as
  this is a forbidden character in the MacOS Finder application. However, the
  Cozy Desktop application is working at a lower level where `:` characters are
  allowed. Those are then displayed as `/` characters in Finder.
  Note that any `/` you see in one of your documents' name in Finder, will be
  synchronised as a `:` in your Cozy and vice versa.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.14.0-beta.1 - 2019-06-27

Improvements for all users:

- In case your client enters an error state, the manual synchronisation button
  will now display is normal label instead of the error label which is already
  display in the window's top bar.
- We fixed an issue with conflicting document names in the previous version but
  introduced in the process a bug with files without extensions. If we detected
  a conflict on a file without extensions that already had the conflict suffix,
  we would use the milliseconds part of the previous conflict suffix as the new
  file extension. We're now correctly handling conflict suffixes replacement
  for all types of documents, with or without extensions.
- We recently tried to reduce the error kinds that would lead to a
  "No Internet connection" status to network errors only and introduced a new
  "Synchronization incomplete" status for cases where one or several of yours
  documents could not be synchronised but some could.
  However, we discovered the network errors we're getting from the remote Cozy
  don't have the shape we expected and were detected as synchronisation errors
  thus displaying the "Synchronization incomplete" status. All network errors
  are now correctly detected and handled as "No Internet connection" errors
  with a retry every second until the connection to your Cozy is back.
- We took this opportunity to handle PouchDB errors thrown when a file or
  directory name starts with an `_` (i.e. those are reserved PouchDB words) as a
  synchronisation error instead of a network error.

Improvements for MacOS users:

- We were forbidding the usage of the `:` character in folder and file names as
  this is a forbidden character in the MacOS Finder application. However, the
  Cozy Desktop application is working at a lower level where `:` characters are
  allowed. Those are then displayed as `/` characters in Finder.
  Note that any `/` you see in one of your documents' name in Finder, will be
  synchronised as a `:` in your Cozy and vice versa.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.4 - 2019-06-25

Improvements for all users:

- We fixed an issue where copies of conflicting files would not be created at
  the right path.

Improvements for Windows & GNU/Linux users:

- We improved our test harness regarding the initial scan of the local synced
  directory. Those new tests already allowed us to identify and fix a couple
  of issues (see next points).
- When moving a directory then updating a descendant file while the app was
  stopped, the file change would not be synced. This now works as expected.
  This used to work but was broken at some point. The new tests should prevent
  this to happen again.
- We've found out that if a file is replaced and it's parent directory
  moved or renamed while the client was stopped, we were issuing a
  deleted event for the file at its new location because its inode is
  different and we didn't match it with its Pouch document.
  However, we have logic that prevents issuing deleted events for paths
  we have seen during the initial scan.
  The problem here is that we were correcting the file's path (i.e. we
  follow its parent move and use its new location in the file's path)
  after checking if we had seen the path during the initial scan.
  We're now correcting the path before doing the check so a scan event
  of the new file's path will prevent the initialDiff from issuing a
  deleted event for it.
- Although some files and directories were correctly ignored during initial
  scan, this was not done immediately, resulting in more work for the app.
  They are now ignored as soon as possible. This should also prevent a couple
  of issues with some Windows system directories.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.4-beta.2 - 2019-06-21

Improvements for Windows & GNU/Linux users:

- We've found out that if a file is replaced and it's parent directory
  moved or renamed while the client was stopped, we were issuing a
  deleted event for the file at its new location because its inode is
  different and we didn't match it with its Pouch document.
  However, we have logic that prevents issuing deleted events for paths
  we have seen during the initial scan.
  The problem here is that we were correcting the file's path (i.e. we
  follow its parent move and use its new location in the file's path)
  after checking if we had seen the path during the initial scan.
  We're now correcting the path before doing the check so a scan event
  of the new file's path will prevent the initialDiff from issuing a
  deleted event for it.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.4-beta.1 - 2019-06-20

Improvements for all users:

- We fixed an issue where copies of conflicting files would not be created at
  the right path.

Improvements for Windows & GNU/Linux users:

- We improved our test harness regarding the initial scan of the local synced
  directory. Those new tests already allowed us to identify and fix an issue
  (see next point).
- When moving a directory then updating a descendant file while the app was
  stopped, the file change would not be synced. This now works as expected.
  This used to work but was broken at some point. The new tests should prevent
  this to happen again.
- Although some files and directories were correctly ignored during initial
  scan, this was not done immediately, resulting in more work for the app.
  They are now ignored as soon as possible. This should also prevent a couple
  of issues with some Windows system directories.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.3 - 2019-06-18

Improvements for Windows & macOS users:

- The application [code signing][code-signing] certificate was updated.

Improvements for Windows & GNU/Linux users:

- When a file or directory is moved or renamed from an ignored path to a
  non-ignored one, it is now handled as a creation.
- When a file or directory is moved or renamed from a non-ignored path to an
  ignored one, it is now handled as a deletion.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.3-beta.2 - 2019-06-18

Improvements for Windows & macOS users:

- The application [code signing][code-signing] certificate was updated.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.3-beta.1 - 2019-06-18

Improvements for Windows & GNU/Linux users:

- When a file or directory is moved or renamed from an ignored path to a
  non-ignored one, it is now handled as a creation.
- When a file or directory is moved or renamed from a non-ignored path to an
  ignored one, it is now handled as a deletion.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.2 - 2019-06-12

Improvements for all users:

- We changed the status label when we catch an error that was not specific
  enough for us to offer you a simple resolution. In this situation we were
  stating that the synchronisation was impossible when in most cases, some
  changes can have been reconciliated and synchronised. We're now saying that
  the synchronisation was incomplete. You should still contact us in this
  situation as we might be able to offer you some help.
- We improved error handling in our auto-update component. Hopefully this
  should make it easier for people with flaky connections to get the latest
  version of the app.
- Whenever we can't reconciliate some changes coming from your remote Cozy with
  your local documents, we try to inform you via special status label and icon.
  Those issues can have different origins but most of them were notified to you
  as your computer lacking an internet connection. We've made some changes to
  display the No Internet connection status only when we experience network
  issues and a generic synchronisation issues status when we can't be more
  precise.
- To help you keep your app up-to-date, we have a mechanism that checks for new
  versions every 24 hours. While we do that check, the app does not attempt to
  synchronise anything to avoid stopping the process while the new version is
  installed. We set a maximum wait time of 5 seconds for the check so that you
  won't get stuck in that state for too long. Unfortunately, we've noticed that
  some users hit that timeout because the check was taking too long and don't
  get the new version notification, probably because of a slow Internet
  connection.
  We've decided to increase the maximum wait time to 10 seconds to make sure
  those users are informed that a new version is available. This should have no
  impact for users with a fast Internet connection.
- In some situations, we can try to reconciliate changes on documents whose
  ancestor we don't know (e.g. a change on `directory/file` when we've never
  received the creation of `directory/`). To help merge those changes we try to
  recreate the missing ancestor. However, we found out that recreating a valid
  ancestor for changes coming from your remote Cozy is plain impossible since we
  don't have its remote metadata such as its identifier. This was causing merge
  issues leading to increased merge times for subsequent changes on other
  documents, increased log files sizes and no way to fix the situation.
  We've made the decision to stop trying to recreate missing ancestors of remote
  changes and ignore those issues altogether. This means that the changes won't
  be merged (i.e. this is no different than the current situation) but we won't
  try to merge them over and over, each time we pull changes from the remote
  Cozy (i.e. every minute or so). We will still detect and attempt to merge
  changes on the documents although the situation will be similar until a change
  on the ancestor is made. But this also means we'll be able to merge all those
  changes if you make a change on the ancestor we didn't get the chance to save.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.2-beta.3 - 2019-06-11

Improvements for all users:

- We improved error handling in our auto-update component. Hopefully this
  should make it easier for people with flaky connections to get the latest
  version of the app.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.2-beta.2 - 2019-06-06

Improvements for all users:

- Whenever we can't reconciliate some changes coming from your remote Cozy with
  your local documents, we try to inform you via special status label and icon.
  Those issues can have different origins but most of them were notified to you
  as your computer lacking an internet connection. We've made some changes to
  display the No Internet connection status only when we experience network
  issues and a generic synchronisation issues status when we can't be more
  precise.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.2-beta.1 - 2019-06-05

Improvements for all users:

- To help you keep your app up-to-date, we have a mechanism that checks for new
  versions every 24 hours. While we do that check, the app does not attempt to
  synchronise anything to avoid stopping the process while the new version is
  installed. We set a maximum wait time of 5 seconds for the check so that you
  won't get stuck in that state for too long. Unfortunately, we've noticed that
  some users hit that timeout because the check was taking too long and don't
  get the new version notification, probably because of a slow Internet
  connection.
  We've decided to increase the maximum wait time to 10 seconds to make sure
  those users are informed that a new version is available. This should have no
  impact for users with a fast Internet connection.
- In some situations, we can try to reconciliate changes on documents whose
  ancestor we don't know (e.g. a change on `directory/file` when we've never
  received the creation of `directory/`). To help merge those changes we try to
  recreate the missing ancestor. However, we found out that recreating a valid
  ancestor for changes coming from your remote Cozy is plain impossible since we
  don't have its remote metadata such as its identifier. This was causing merge
  issues leading to increased merge times for subsequent changes on other
  documents, increased log files sizes and no way to fix the situation.
  We've made the decision to stop trying to recreate missing ancestors of remote
  changes and ignore those issues altogether. This means that the changes won't
  be merged (i.e. this is no different than the current situation) but we won't
  try to merge them over and over, each time we pull changes from the remote
  Cozy (i.e. every minute or so). We will still detect and attempt to merge
  changes on the documents although the situation will be similar until a change
  on the ancestor is made. But this also means we'll be able to merge all those
  changes if you make a change on the ancestor we didn't get the chance to save.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1 - 2019-05-27

Improvements for all users:

- We added a new icon set for the Offline status. Prior to this version,
  whenever we detected you might be disconnected from the Internet, we would
  display a "pause" icon with the "Disconnected" status label. We're now
  displaying a shadowed version of the main icon and a "No Internet connection"
  status label. We hope this is clearer to you.
- We fixed a bug in the way we sort changes coming from your remote Cozy. For
  some changes like the replacement of a file, the order in which we receive
  changes from the remote Cozy is crucial to applying it correctly on the local
  filesystem. In this particular case, we were not always sorting correctly the
  deletion and recreation of the file (or folder) which could lead to documents
  disappearing or conflicts to appear.
- We are now able to detect the use of a temporary file in some situations and
  correctly handle it (i.e. not move it to the trash and synchronise the new
  version).
- We've updated again some of our dependencies that don't require changes in
  our code. Those are the same that were upgraded in [v3.13.1-alpha.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.13.1-alpha.1)
  then downgraded back in [v3.13.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.13.1-beta.1).
  We investigated, identified and excluded the problematic updates, so
  networking should work as expected this time.

Improvements for Windows & GNU/Linux users:

- When renaming folders and deleting part of their content while the client
  was stopped, the deletion should now be properly handled on restart.

Improvements for GNU/Linux users:

- We've mitigated an issue LibreOffice users could encounter while saving.
  LibreOffice uses an intermediary temporary file when saving and in some
  situations we could end up deleting the file altogether or move the previous
  version to the Cozy's trash and even not be able to synchronise the new
  version.
  We're now ignoring those temporary files (i.e. with extension `.osl-tmp`)
  which results in a correct update of the office document.

Improvements for contributors:

- We've decided to run prettier over our entire codebase with the cozy-app
  eslint config and to keep using it from now on. This will remove the need to
  check for syntax errors and improve homogeneity between Cozy Cloud javascript
  projects.

Changes that should have no effects:

- We did some minimal refactoring on our proxy setup to introduce some tests.
  There should be no effects on the way the proxy works.

There are some known issues that we'll tackle in the next releases:

- When we don't detect any update closely following the temporary file deletion
  and that file is not ignored, we end up deleting the file that was saved.
  This is a more general situation and should be fixed very soon.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-beta.5 - 2019-05-27

Improvements for all users:

- We've updated again some of our dependencies that don't require changes in
  our code. Those are the same that were upgraded in [v3.13.1-alpha.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.13.1-alpha.1)
  then downgraded back in [v3.13.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.13.1-beta.1).
  We investigated, identified and excluded the problematic updates, so
  networking should work as expected this time.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-beta.4 - 2019-05-24

Improvements for GNU/Linux users:

- We've mitigated an issue LibreOffice users could encounter while saving.
  LibreOffice uses an intermediary temporary file when saving and in some
  situations we could end up deleting the file altogether or move the previous
  version to the Cozy's trash and even not be able to synchronise the new
  version.
  We're now ignoring those temporary files (i.e. with extension `.osl-tmp`)
  which results in a correct update of the office document.

Improvements for all users:

- The solution above applies only to LibreOffice users on Linux while there are
  other software saving through a temporary file.
  We are now able to detect the use of a temporary file in some situations and
  correctly handle it (i.e. not move it to the trash and synchronise the new
  version).

There are some known issues that we'll tackle in the next releases:

- When we don't detect any update closely following the temporary file deletion
  and that file is not ignored, we end up deleting the file that was saved.
  This is a more general situation and should be fixed very soon.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-beta.3 - 2019-05-21

Improvements for MacOS users:

- We recently introduced a new icon for the Disconnected app status when we
  can't reach your remote Cozy. On MacOS, this icon was rendered incorrectly
  within the app itself, in the status bar.
  We changed the icon to be of the expected color in the systray and the app
  status bar.

Changes that should have no effects:

- We did some minimal refactoring on our proxy setup to introduce some tests.
  There should be no effects on the way the proxy works.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-beta.2 - 2019-05-15

Improvements for all users:

- We added a new icon set for the Offline status. Prior to this version,
  whenever we detected you might be disconnected from the Internet, we would
  display a "pause" icon with the "Disconnected" status label. We're now
  displaying a shadowed version of the main icon and a "No Internet connection"
  status label. We hope this is clearer to you.
- We fixed a bug in the way we sort changes coming from your remote Cozy. For
  some changes like the replacement of a file, the order in which we receive
  changes from the remote Cozy is crucial to applying it correctly on the local
  filesystem. In this particular case, we were not always sorting correctly the
  deletion and recreation of the file (or folder) which could lead to documents
  disappearing or conflicts to appear.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-beta.1 - 2019-05-06

Improvements for Windows & GNU/Linux users:

- When renaming folders and deleting part of their content while the client
  was stopped, the deletion should now be properly handled on restart.

Improvements for all users:

- We downgraded the dependencies upgraded in [v3.13.1-alpha.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.13.1-alpha.1)
  because the upgrade broke networking. It should work again now.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.1-alpha.1 - 2019-04-30

Improvements for contributors:

- We've decided to run prettier over our entire codebase with the cozy-app
  eslint config and to keep using it from now on. This will remove the need to
  check for syntax errors and improve homogeneity between Cozy Cloud javascript
  projects.

Improvements for all users:

- We've updated some of our dependencies. There shouldn't be any consequence but
  it's just good hygiene and could potentially fix issues we don't even know.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!


## 3.13.0 - 2019-04-29

Improvements for Windows and GNU/Linux users:

- We completely revamped the local watcher (the component looking for changes
  in your local *Cozy Drive* directory). It should now be faster and more
  reliable when synchronizing live changes. Expect a few more optimizations
  regarding the initial scan very soon.
- The watcher type used (i.e. atom or chokidar) can still be chosen via the
  config file. The new watcher (atom) is the default on Windows and GNU/Linux.

Improvements for all users:

- We've updated our icons to reflect the new Cozy branding with a deep blue
  instead of the faded one and more of that blue around our lovely little cloud.
- The remote watcher now ignores changes with a revision lower than the one
  we've saved on the associated document in the local Pouch. Failing to do so
  was leading to files disappearing locally (before reappearing a short while
  later) during their upload to the Cozy. This could also be the cause of
  unexpected and undocumented behavior.
- Since it could be surprising and even misleading, we've removed the count of
  the remaining items to be synchronised until we can be sure it's always
  accurate. In the meantime, you'll see a simpler message indicating the client
  is syncing.
- We fixed an issue we had in the generation of a conflict file name
  where the conflict suffixes could be added indefinitely in case the
  conflicting file would get in conflict again. It happened that directories or
  files without an extension were still subject to a similar issue.
  We made sure they will only ever have one conflict suffix added to
  their name even in case they get in conflict again.
- During the synchronisation process, a document can change either locally
  (e.g. its checksum has changed because of a modification) or on the Cozy
  (e.g. the file was moved or modified by another client). In this situation the
  Cozy won't accept the change and will answer with an error. When we receive
  errors from the Cozy we retry up to 3 times to apply the change but if the
  document has changed, we will never be able to apply it and will only lose
  time by retrying.
  We now retry only on network and disk space errors to speed up the
  synchronisation of files rapidly changing.
- Files and folders named like a volume (e.g. C:) and at the root of the folder
  watched by Cozy Desktop could lead to an infinite loop if they or any of their
  children were ever modified. Those are now handled properly and won't be
  ignored either.
- Fixed a race condition case were a sharing could be disabled when a folder
  was moved locally while another one was added remotely to the same
  destination.
- We updated one of our main dependencies, Electron, to its 2.x version. We are
  still not using the latest version but this one brings us back support from
  the Electron team and security fixes. Other updates will come in the following
  releases.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.8 - 2019-04-25

Improvements for Windows and GNU/Linux users:

- We fixed the last known issue regarding files and directories renamed while
  the client is stopped using the new watcher. The next release should be a
  stable one! 🚀

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.7 - 2019-04-23

Improvements for all users:

- The remote watcher now ignores changes with a revision lower than the one
  we've saved on the associated document in the local Pouch. Failing to do so
  was leading to files disappearing locally (before reappearing a short while
  later) during their upload to the Cozy. This could also be the cause of
  unexpected and undocumented behavior.

Improvements for MacOS users:

- When updating the Cozy branding, we messed up the alignment of icons in the
  MacOS installer. The Cozy app icon, the arrow and the Applications folder are
  now properly aligned and vertically centered in the installer window.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.6 - 2019-04-19

Improvements for all users:

- We've updated our icons to reflect the new Cozy branding with a deep blue
  instead of the faded one and more of that blue around our lovely little cloud.

Improvements for Windows and GNU/Linux users:

- With our new watcher, some remote movements that were detected, taken into
  account but not applied locally (i.e. the file or directory itself would not
  have been moved on the filesystem) because the client was stopped in the
  middle of the synchronisation process would not be correctly applied after the
  client is relaunched. In this situation, we would end up duplicating the
  document that was moved, at its previous path.
  We made sure we detect unapplied remote movements so we can finish applying
  them and not duplicate your documents.
- Since it could be surprising and even misleading, we've removed the count of
  the remaining items to be synchronised until we can be sure it's always
  accurate. In the meantime, you'll see a simpler message indicating the client
  is syncing.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.5 - 2019-04-17

Improvements for Windows and GNU/Linux users:

- We now detect and correctly synchronise file moves where the destination
  already existed and is being overwritten.
  However since filesystems and file browsers are all different, you might
  have a different experience on Linux. We made sure this works with the
  GNOME file browser, Nautilus.
- We improved the way we aggregate quick modifications to files to avoid
  having to synchronise a lot of changes when we only care about the result
  of the last one.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.4 - 2019-04-15

Improvements for Windows and GNU/Linux users:

- We recently fixed an issue we had in the generation of a conflict file name
  where the conflict suffixes could be added indefinitely in case the
  conflicting file would get in conflict again. It happens that directories are
  still subject to a similar issue.
  We made sure directories will only ever have one conflict suffix added to
  their name event in case they get in conflict again.
- During the synchronisation process, a document can change either locally
  (e.g. its checksum has changed because of a modification) or on the Cozy
  (e.g. the file was moved or modified by another client). In this situation the
  Cozy won't accept the change and will answer with an error. When we receive
  errors from the Cozy we retry up to 3 times to apply the change but if the
  document has changed, we will never be able to apply it and will only lose
  time by retrying.
  We now retry only on network and disk space errors to speed up the
  synchronisation of files rapidly changing.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.3 - 2019-04-11

Improvements for Windows and GNU/Linux users:

- Rapid successive changes on the same file were possibly generating conflicts
  because the new watcher was messing up with the changes propagation. There
  were actually 2 underlying issues behind this: one that was specific to the
  new watcher and another that was not. We actually fixed both, although the
  second one was not supposed to happen anymore once the new watcher would
  behave correctly, but could still have been uncovered during upcoming
  optimizations.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.2 - 2019-04-09

Improvements for Windows users:

- With the new local watcher, we introduced a more precise way to identify files
  and folders on the filesystem. To make sure previously detected documents
  benefit from this new identification we need to migrate all of them when we
  get the new identifier. This version takes care of the migration in a way that
  avoids running a full synchronisation when we only change the identifier as it
  has value on the local client only.

There are some known issues that we'll tackle in the next releases:

- On Windows, moving a tree of directories and files to a destination that
  shares part of this tree (e.g. `src/dir/subdir/file` → `dst/dir/subdir/file`)
  and overwriting the destinations will result in conflicts being created for
  the overwritten files.
- On Windows, the synchronisation of a remote move stopped before it's been
  applied on the local system will won't be resumed when restarting the client.
- On Linux, some movements done while the client was stopped won't be correctly
  detected and handled when starting the client.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-beta.1 - 2019-04-03

Improvements for Windows and Linux users:

- The new local watcher is now the default watcher. It should bring better
  performance in local changes analysis.
- We found a bug in the synchronisation process of directories that could lead
  to missed updates. We have not seen any reports of it but the mechanism has
  been fixed anyway.
- We updated one of our main dependencies, Electron, to its 2.x version. We are
  still not using the latest version but this one brings us back support from
  the Electron team and security fixes. Other updates will come in the following
  releases.

Improvements for Windows users:

- Files and folders named like a volume (e.g. C:) and at the root of the folder
  watched by Cozy Desktop could lead to an infinite loop if they or any of their
  children were ever modified. Those are now handled properly and won't be
  ignored either.

There are some known issues that we'll tackle in the next releases:

- On Windows, moving a tree of directories and files to a destination that
  shares part of this tree (e.g. `src/dir/subdir/file` → `dst/dir/subdir/file`)
  and overwriting the destinations will result in conflicts being created for
  the overwritten files.
- On Windows, the synchronisation of a remote move stopped before it's been
  applied on the local system will won't be resumed when restarting the client.
- On Linux, some movements done while the client was stopped won't be correctly
  detected and handled when starting the client.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-alpha.3 - 2019-04-02

Improvements for Windows users:

- Changing only the case of a file/directory name now works as expected when
  using the new watcher.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-alpha.2 - 2019-03-28

Improvements for Windows and Linux users:

- Successive moves (e.g. A → B → C → D) are now correctly applied (i.e. A → D)
  with the new local watcher.
- The introduction of the new local watcher brought a performance regression
  during the initial Cozy directory scan. We ported an optimisation we had in
  the previous watcher to the new one which should make the initial scan phase
  about 3x faster.
- We found a bug in the synchronisation process of directories that could lead
  to missed updates. We have not seen any reports of it but the mechanism has
  been fixed anyway.
- We updated one of our main dependencies, Electron, to its 2.x version. We are
  still not using the latest version but this one brings us back support from
  the Electron team and security fixes. Other updates will come in the following
  releases.

Improvements for Windows users:

- Moves from a directory that has just been moved to a path outside this
  directory will now be correctly detected and applied with the new local
  watcher.

There are some known issues that we'll tackle in the next releases:

- On Windows, moving a tree of directories and files to a destination that
  shares part of this tree (e.g. `src/dir/subdir/file` → `dst/dir/subdir/file`)
  and overwriting the destinations will result in conflicts being created for
  the overwritten files.
- On Windows, the synchronisation of a remote move stopped before it's been
  applied on the local system will won't be resumed when restarting the client.
- On Linux, some movements done while the client was stopped won't be correctly
  detected and handled when starting the client.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.13.0-alpha.1 - 2019-03-06

Improvements for Windows and Linux users:

- The new local watcher is now the default watcher. It should bring better
  performance in local changes analysis.

Improvements for Windows users:

- Files and folders named like a volume (e.g. C:) and at the root of the folder
  watched by Cozy Desktop could lead to an infinite loop if they or any of their
  children were ever modified. Those are now handled properly and won't be
  ignored either.

There are some known issues that we'll tackle in the next releases:

- On Windows, moving the child of a moved directory won't be handled properly.
- On Windows, moving a tree of directories and files to a destination that
  shares part of this tree (e.g. `src/dir/subdir/file` → `dst/dir/subdir/file`)
  and overwriting the destinations will result in conflicts being created for
  the overwritten files.
- On Windows, the synchronisation of a remote move stopped before it's been
  applied on the local system will won't be resumed when restarting the client.
- On Linux, some movements done while the client was stopped won't be correctly
  detected and handled when starting the client.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.12.1-beta.1 - 2019-02-05

Improvements for Windows and Linux users:

- The watcher type used (i.e. atom or chokidar) can now be chosen via the config
  file. This means the new watcher will be testable easily with any version of
  the app starting from now.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.12.1-alpha.1 - 2019-02-04

**Notice:** This release uses the new watcher by default on Windows and
GNU/Linux for testing purpose only and should not be used in other situations.

Improvements for all users:

- Fixed a race condition case were a sharing could be disabled when a folder
  was moved locally while another one was added remotely to the same
  destination.

Improvements for Windows and Linux users:

- The right path separator is now used while squashing successive events (e.g.
  file added or updated, then moved immediately) in the new watcher.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.12.0 - 2019-02-04

Improvements for all users:

- We've improved the way we handle the revision of newly detected documents that
  are created at paths that have already been synchronised in the past. This was
  a potential source of conflicts were you to modify the content of such file.
- When moving a folder locally then quickly changing the content of a subfile
  on the same device, the file content may not be updated in the Cozy in some
  cases. Everything should now work as expected.
- We keep track of the changes made to documents to synchronise either with the
  remote Cozy or the local filesystem using version numbers for each side of the
  synchronisation. When moving a document, be it either a directory or a file,
  on the local filesystem as part of its parent directory move, the new local
  version number would be false, resulting in a possible desynchronisation of
  content updates.
  We now make sure both the local and remote version numbers get reset in
  this situation so future updates will be synchronised in the right direction.
- We've modified the way we handle child documents updates so everything gets
  synchronised, even if a child update occurs quickly after its parent directory
  has been renamed.
- We found out that moving a file or a directory to a path that has already been
  used in the path then deleted could lead to irrelevant version numbers for the
  new document and in the end to unnecessary conflicts.
  We now correct our version numbers when this situation happens so future
  updates to the document are handled correctly.

Improvements for contributors:

- The developer documentation's [design section](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/developer/design.md#local-watcher) has been updated with the reasons
  that led to the decision to create a new local watcher and diagrams explaining
  how it works on Windows and Linux.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!


## 3.12.0-beta.3 - 2019-01-31

Improvements for all users:

- We've modified the way we handle child documents updates so everything gets
  synchronised, even if a child update occurs quickly after its parent directory
  has been renamed.
- We found out that moving a file or a directory to a path that has already been
  used in the path then deleted could lead to unrelevant version numbers for the
  new document and in the end to unnecessary conflicts.
  We now correct our version numbers when this situation happens so future
  updates to the document are handled correctly.

Happy syncing!

## 3.12.0-beta.2 - 2019-01-23

Improvements for all users:

- We keep track of the changes made to documents to synchronise either with the
  remote Cozy or the local filesystem using version numbers for each side of the
  synchronisation. When moving a document, be it either a directory or a file,
  on the local filesystem as part of its parent directory move, the new local
  version number would be false, resulting in a possible desynchronisation of
  content updates.
  We now make sure both the local and remote version numbers get resetted in
  this situation so future updates will be synchronised in the right direction.

Happy syncing!

## 3.12.0-beta.1 - 2019-01-18

Improvements for all users:

- When moving a folder locally then quickly changing the content of a subfile
  on the same device, the file content may not be updated in the Cozy in some
  cases. Everything should now work as expected.

Notice for Windows & GNU/Linux users:

- This beta release uses the old watcher implementation. The new one is only
  used by default in alpha releases. We're still actively testing and
  improving it to make it the default in stable releases!

Happy syncing!

## 3.12.0-alpha.3 - 2019-01-17

Improvements for all users:

- The count of objects to be synchronised was always 1 with the new local
  watcher.
  We've fixed this so the count is accurate and decreases with each element
  successfully synchronised.
- In some situations, the detection of local changes could be stalling.
  We've adapted the watcher so it detects when it can start processing
  filesystem events.

Improvements for contributors:

- The developer documentation's [design section](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/developer/design.md#local-watcher) has been updated with the reasons
  that led to the decision to create a new local watcher and diagrams explaining
  how it works on Windows and Linux.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.12.0-alpha.2 - 2019-01-09

Improvements for all users:

- We fixed the issue preventing the new watcher from working past the initial
  synchronisation folder scan.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.12.0-alpha.1 - 2019-01-08

Improvements for all users:

- We've improved the way we handle the revision of newly detected documents that
  are created at paths that have already been synchronised in the past. This was
  a potential source of conflicts were you to modify the content of such file.

Improvements for Windows and Linux users:

- We're testing a new implementation of our local changes watcher on Windows and
  Linux. This should bring performance gains, faster change detection and in
  fine better stability.
  Some bugs can be present and not all existing features are implemented yet
  though.

  It is acitvated by default in this early build for testing purposes only and
  should not be used in other situations.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.2 - 2019-01-03

See [3.11.2-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.2-beta.1)
See [3.11.2-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.2-beta.2)

Improvements for all users:

- We've improved the wording of the updater window so it says it's downloading
  the new version and displays the Cozy Cloud logo so you know what's being
  updated at first glance.
- If a directory is overwritten by a move on your Cozy, we would move it to the
  trash and, in some situations, after synchronising your local client, the
  directory would not be overwritten on your computer. We're now skipping the
  move to the trash and overwriting the directory.
- We've improved the conflict resolution after changes made to local files when
  the client was stopped. In this situation, we would resolve the conflict on
  the remote Cozy and end up renaming the local copy with the `-conflict-`
  suffix and could overwrite its content with the remote content thus losing
  the latest local changes.
  We're now resolving the conflict locally, keeping the remote version
  untouched. This has the additionnal benefit of keeping shared files free from
  the `-conflict-` suffix.
- A function we introduced in version 3.11.0 was responsible for an increase in
  false negatives for an invariant check, leading to errors being thrown and
  synchronisations blocked.
  We've reworked said function in a way that won't trigger false negatives for
  the invariant which will reduce the number of errors and thus block
  synchronisations.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.2-beta.2 - 2018-12-28

Improvements for all users:

- We've improved the conflict resolution after changes made to local files when
  the client was stopped. In this situation, we would resolve the conflict on
  the remote Cozy and end up renaming the local copy with the `-conflict-`
  suffix and could overwrite its content with the remote content thus losing
  the latest local changes.
  We're now resolving the conflict locally, keeping the remote version
  untouched. This has the additionnal benefit of keeping shared files free from
  the `-conflict-` suffix.
- A function we introduced in version 3.11.0 was responsible for an increase in
  false negatives for an invariant check, leading to errors being thrown and
  synchronisations blocked.
  We've reworked said function in a way that won't trigger false negatives for
  the invariant which will reduce the number of errors and thus block
  synchronisations.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.2-beta.1 - 2018-12-21

Improvements for all users:

- We've improved the wording of the updater window so it says it's downloading
  the new version and displays the Cozy Cloud logo so you know what's being
  updated at first glance.
- If a directory is overwritten by a move on your Cozy, we would move it to the
  trash and, in some situations, after synchronising your local client, the
  directory would not be overwritten on your computer. We're now skipping the
  move to the trash and overwriting the directory.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.1 - 2018-12-17

See [3.11.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.1-beta.1)
See [3.11.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.1-beta.2)

Improvements for all users:

- Moving a file or a folder multiple times in a row, synchronising them all at
  once, ending on a path that was also an intermediary step (e.g. move document
  A to B to C to B) would result in the synchronisation of the movement of the
  file or folder to the last known path before the movement to the intermediary
  step path and the addition of a new copy of the file or folder at the path
  of the intermediary step (i.e. movement from A to C and addition of B). We now
  correctly interpret those successive movements (i.e. movement from A to B).
- Editing the content of a file just moved with one of its ancestor could lead
  to the incorrect detection of a conflict with its remote couterpart. We're now
  updating its content as expected and thus avoiding creating any `-conflicts-`
  file.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.1-beta.2 - 2018-12-12

Improvements for all users:

- Editing the content of a file just moved with one of its ancestor could lead
  to the incorrect detection of a conflict with its remote couterpart. We're now
  updating its content as expected and thus avoiding creating any `-conflicts-`
  file.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.1-beta.1 - 2018-12-05

Improvements for all users:

- Moving a file or a folder multiple times in a row, synchronising them all at
  once, ending on a path that was also an intermediary step (e.g. move document
  A to B to C to B) would result in the synchronisation of the movement of the
  file or folder to the last known path before the movement to the intermediary
  step path and the addition of a new copy of the file or folder at the path
  of the intermediary step (i.e. movement from A to C and addition of B). We now
  correctly interpret those successive movements (i.e. movement from A to B).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.0 - 2018-12-03

See [3.11.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.0-beta.1)
See [3.11.0-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.11.0-beta.2)

Improvements for all users:

- We will now alert you when a new version of the app is available and give you
  the option of restarting it to download and apply the new version or postpone
  it.
- You now have the opportunity to force a manual synchronisation from the
  settings panel. This will be useful mostly to fetch some remote changes
  without waiting for the periodic pull.
- Being always careful when it comes to your data, trying our best not to
  lose any of it, when we try to reconciliate changes, we try to figure out
  if the two documents we're comparing are the same. We were a bit too
  conservative on this side and a lot of changes could lead to false conflicts
  because of this. We're now doing a smarter comparison which should lead to
  a lot less `-conflict-` documents being generated.
- For the same reason, when it comes to conflicts we prefer to leave it to you
  to choose between the two versions we detected. However, when it comes to
  changes that haven't been synchronized yet, we can avoid creating a conflict
  and pick the latest version for you. From now on, we won't create a
  `-conflict-` version of a folder that has been changed locally and never
  synchronized remotely with your Cozy.
- If a file was changed remotely and its parent folder moved or renamed, we
  could end up moving the file locally but not synchronize its new content.
  We're now synchronizing all those changes correctly, leaving you with an
  updated file in the correct location.
- Similarly, adding a file locally to a folder that was just renamed or moved
  but not yet fully synchronized with the remote Cozy would result in a
  situation where the file is never uploaded to the remote Cozy and any changes
  to it wouldn't be synchronized either. We're now making sure we finish
  synchronizing the folder change and then synchronize the newly added file.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.0-beta.2 - 2018-11-29

Improvements for all users:

- You now have the opportunity to force a manual synchronisation from the
  settings panel. This will be useful mostly to fetch some remote changes
  without waiting for the periodic pull.
- Being always careful when it comes to your data, trying our best not to
  lose any of it, when we try to reconciliate changes, we try to figure out
  if the two documents we're comparing are the same. We were a bit too
  conservative on this side and a lot of changes could lead to false conflicts
  because of this. We're now doing a smarter comparison which should lead to
  a lot less `-conflict-` documents being generated.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.11.0-beta.1 - 2018-11-28

Improvements for all users:

- We will now alert you when a new version of the app is available and give you
  the option of restarting it to download and apply the new version or postpone
  it.
- To avoid losing your data, we're very careful when it comes to conflicts and
  we prefer to leave it to you to choose between the two versions we detected.
  However, when it comes to changes that haven't been synchronized yet, we can
  avoid creating a conflict and pick the latest version for you.
  From now on, we won't create a `-conflict-` version of a folder that has been
  changed locally and never synchronized remotely with your Cozy.
- If a file was changed remotely and its parent folder moved or renamed, we
  could end up moving the file locally but not synchronize its new content.
  We're now synchronizing all those changes correctly, leaving you with an
  updated file in the correct location.
- Similarly, adding a file locally to a folder that was just renamed or moved
  but not yet fully synchronized with the remote Cozy would result in a
  situation where the file is never uploaded to the remote Cozy and any changes
  to it wouldn't be synchronized either. We're now making sure we finish
  synchronizing the folder change and then synchronize the newly added file.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.4 - 2018-11-26

See [3.10.4-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.4-beta.1)

Improvements for all users:

- When the app was stopped in the middle of a synchronization, with folder moves
  coming from the remote Cozy, we could end up detecting conflicts on those
  folders undefinitely after restarting it. We now handle unapplied moves upon
  startup and avoid creating unnecessary `-conflicts-` folders.
- If a file existing both locally and in the remote Cozy was updated more than
  once without synchronization, the latest changes would create a conflict and
  its resolution would override the file with an older version leading to data
  loss. We now simply override the local version of the file with the latest
  changes and synchronize them with the remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.4-beta.1 - 2018-11-22

Improvements for all users:

- When the app was stopped in the middle of a synchronization, with folder moves
  coming from the remote Cozy, we could end up detecting conflicts on those
  folders undefinitely after restarting it. We now handle unapplied moves upon
  startup and avoid creating unnecessary `-conflicts-` folders.
- If a file existing both locally and in the remote Cozy was updated more than
  once without synchronization, the latest changes would create a conflict and
  its resolution would override the file with an older version leading to data
  loss. We now simply override the local version of the file with the latest
  changes and synchronize them with the remote Cozy.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.3 - 2018-11-21

See [3.10.3-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.3-beta.1)
See [3.10.3-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.3-beta.2)
See [3.10.3-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.3-beta.3)

Improvements for all users:

- The app is now available in spanish. Huge thanks to our translation
  contributors, especially Hernando :heart:
- Files and directories can now only have one `-conflict-...` suffix at a time.
  Existing ones with multiple suffixes won't be renamed automatically, but in
  case a new conflict occurs, their suffixes will be squashed into a single
  one with the new timestamp. Although this doesn't fix the root causes, it
  should make the symptom easier to deal with. We're sill investigating the
  underlying issues. Expect more fixes soon.
- We fixed a couple of issues preventing user-defined ignore rules to be
  loaded.
- Files moved right after they've been added to the Cozy folder and before we've
  had the chance to upload them will be synchronized anyway, at the right path.
- When a folder was moved on the Cozy or another device, the metadata of some
  of its content was not updated properly, although the content was effectively
  moved to the right place. Subsequent updates to these subfolders & subfiles
  could then trigger unexpected conflicts. This should now work as expected. (#1274)
- When a file was effectively edited on 2 devices and the local one was detected
  first, both were mistakenly renamed with a conflict suffix. Now only one of
  them will be renamed. (#1285)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.3-beta.3 - 2018-11-20

Improvements for all users:

- When a folder was moved on the Cozy or another device, the metadata of some
  of its content was not updated properly, although the content was effectively
  moved to the right place. Subsequent updates to these subfolders & subfiles
  could then trigger unexpected conflicts. This should now work as expected. (#1274)
- When a file was effectively edited on 2 devices and the local one was detected
  first, both were mistakenly renamed with a conflict suffix. Now only one of
  them will be renamed. (#1285)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.3-beta.2 - 2018-11-14

Improvements for all users:

- Files moved right after they've been added to the Cozy folder and before we've
  had the chance to upload them will be synchronized anyway, at the right path.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.3-beta.1 - 2018-11-08

Improvements for all users:

- The app is now available in spanish. Huge thanks to our translation
  contributors, especially Hernando :heart:
- Files and directories can now only have one `-conflict-...` suffix at a time.
  Existing ones with multiple suffixes won't be renamed automatically, but in
  case a new conflict occurs, their suffixes will be squashed into a single
  one with the new timestamp. Although this doesn't fix the root causes, it
  should make the symptom easier to deal with. We're sill investigating the
  underlying issues. Expect more fixes soon.
- We fixed a couple of issues preventing user-defined ignore rules to be
  loaded.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.2 - 2018-11-06

See [3.10.2-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.2-beta.1)

Improvements for all users:

* We fixed a couple of issues where a temporary file and an updated/overwritten
  one (both typically generated by office suites) were mistakenly identified as
  a move/renaming.
* We also fixed a small offline/online flashing status issue.

Improvements for Windows users:

* In case your synchronized directory is on a separate volume, the Windows
  recycle bin (`$Recycle.Bin`) folder is now properly ignored.

Improvements for contributors:

* `yarn install` now only installs npm dependencies: no more electron rebuild
  nor elm packages install. `yarn install:all` can be used instead for this.
* Continuous integration & publication are faster (more on Windows soon).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.2-beta.1 - 2018-11-05

Improvements for all users:

* We fixed a couple of issues where a temporary file and an updated/overwritten
  one (both typically generated by office suites) were mistakenly identified as
  a move/renaming.
* We also fixed a small offline/online flashing status issue.

Improvements for Windows users:

* In case your synchronized directory is on a separate volume, the Windows
  recycle bin (`$Recycle.Bin`) folder is now properly ignored.

Improvements for contributors:

* `yarn install` now only installs npm dependencies: no more electron rebuild
  nor elm packages install. `yarn install:all` can be used instead for this.
* Continuous integration & publication are faster (more on Windows soon).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.1 - 2018-10-23

See [3.10.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.1-beta.1)

Improvements for all users:

* We fixed handling of connection loss. The Cozy Drive client will now correctly display when it's offline and re-attempt synchronization regularly.
* We improved the way we save the configuration file and gracefully recover if the configuration file is incorrect.
* Some text, translations and styles updates on the user interface

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.1-beta.1 - 2018-10-23

Improvements for all users:

* We fixed handling of connection loss. The Cozy Drive client will now correctly display when it's offline and re-attempt synchronization regularly.
* We improved the way we save the configuration file and gracefully recover if the configuration file is incorrect.
* Some text, translations and styles updates on the user interface

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!


## 3.10.0 - 2018-10-23

Improvements for all users:

* We fixed a couple of harmless issues occuring after syncing a move locally. (see [3.10.0-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.4))
* We fixed an issue occuring when the destination of a file or directory moved
  on one side was already existing on the other side. The conflict is now
  properly resolved. (see [3.10.0-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.3))
* Renaming directories *a* to *c* then *b* to *a* was working for files but not
  for directories. This now works for simple cases. A few complex ones are
  still not working however. (see [3.10.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.1))
* In some very rare cases where the content of a file in the Cozy doesn't match
  the correct checksum, the app will check the local file version and reupload
  it when relevant. (see [3.10.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.1))
* Starting from now, we will be able to automatically receive notifications of
  errors encountered by our users. Error reports won't include user logs in
  order to respect your privacy. We'll still have to ask you individually to
  send us our logs in order to investigate complex issues. But this should help
  us figuring out which errors occur the most, since not so many people can
  find the time to report them. For now, the notifications are only sent for a
  few hard-to-investigate issues, but we'll progressively send more of them. (see [3.9.1-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.4))
* Checksums for new local files were computed but not sent during the initial
  upload, possibly delaying detection of content issues. Still the checksum was
  computed by the Cozy and any issue would've be detected during next polling.
  They will now be effectively detected as soon as they should be. (see [3.9.1-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.4))
* Moves overwriting the destination performed on another device should now be
  synchronized as expected. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))
* Some part of the synchronization engine dating back to Cozy v2 was not
  necessarily preventing local directory of file overwrites. This part was
  reworked to reach the same level as the other ones, possibly fixing a couple
  of bugs. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))
* We noticed that synchronizing a local file update to the Cozy could fail in
  some very rare cases. We added a few automatic verifications which should
  help us narrow the issue, so hopefully we'll be able to definitely fix it in
  another release. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))
* Fix synchronization bugs when merging and overwriting folders. (see [3.9.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.1))

Improvements for Windows & macOS users:

* When renaming a remote directory by only changing its case, the change was
  applied locally but it was also triggering a weird synchronization loopback
  error. This should now work as expected. (see [3.10.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.1))
* Making the whole or some filename part upper/lower case used to be notably
  unsupported. It should now work everywhere. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))
* When two files and/or directories with only upper/lower case differences in
  their names are coexisting on your Cozy, only one of them will be
  synchronized locally on your case-preservative OS and the other one will be
  renamed as a conflict so you at least have a way to end up with the exact
  same tree on your Cozy and all your devices. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))

Improvements for Windows users:

* A few users reported that the app couldn't read its configuration anymore,
  while it used to work. Although were still investigating the issue, the app
  will now properly warn the user and take her back to the onboarding. We'll
  soon come up with a way to write the configuration to prevent a theoretically
  possible issue. Please report to us in case you're still affected (especially
  including whether or not you opened your `.cozy-desktop/config.json` file
  with some third-party application). (see [3.10.0-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.3))
* Files made (non-)executable on another macOS or GNU/Linux device were
  triggering useless synchronization cycles (or conflict in the worst case).
  This should now work as expected. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))

Improvements for macOS users:

* On devices automatically migrated from HFS+ to APFS while upgrading to macOS
  High Sierra, the initial scan was mistakenly detecting some files as conflict
  due to the new way we're detecting case/encoding conflicting files. This
  should now work as expected. This issue could theoretically have happened on
  both macOS & Windows in rare cases of weird local filename changes. (see [3.9.1-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.4))
* A regression on folder moves overwriting their destination was fixed (#1181) (see [3.9.1-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.3))
* Better support for APFS (see [3.9.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.1))

Improvements for macOS and GNU/Linux users:

* Local files made non-executable will now effectively be synced as
  non-executable on the Cozy and your other devices. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))
* Please note that currently the permissions of your local files may be forced
  to 755 or 644, depending on the *executable* status. However this should not
  be a major issue, unless your made both your personal directory and your
  *Cozy Drive* directory accessible to other users on your device. We'll
  definitely come up with a better solution at some point to make the
  executable bits match your existing local read/write ones. (see [3.9.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.1-beta.2))

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.0-beta.4 - 2018-10-22

Improvements for all users:

- We fixed a couple of harmless issues occuring after syncing a move locally.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.0-beta.3 - 2018-10-17

Improvements for all users:

- We fixed an issue occuring when the destination of a file or directory moved
  on one side was already existing on the other side. The conflict is now
  properly resolved.
- In [3.10.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.10.0-beta.1)
  we introduced automatic reupload of content mismatching files. This actually
  relies upon a recent cozy-stack feature. Old stacks lacking the feature were
  not handled gracefully. Reupload is now properly disabled for old stacks.

Improvements for Windows users:

- A few users reported that the app couldn't read its configuration anymore,
  while it used to work. Although were still investigating the issue, the app
  will now properly warn the user and take her back to the onboarding. We'll
  soon come up with a way to write the configuration to prevent a theoretically
  possible issue. Please report to us in case you're still affected (especially
  including whether or not you opened your `.cozy-desktop/config.json` file
  with some third-party application).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.0-beta.2 - 2018-10-12

Improvements for all users:

* We fixed an issue introduced by the recent case/encoding handling changes.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.10.0-beta.1 - 2018-10-11

Improvements for all users:

* We introduces automatic error notifications in 3.9.4-beta.1, but a few errors
  were actually not sent. They're effectively sent now.
* Renaming directories *a* to *c* then *b* to *a* was working for files but not
  for directories. This now works for simple cases. A few complex ones are
  still not working however.
* In some very rare cases where the content of a file in the Cozy doesn't match
  the correct checksum, the app will check the local file version and reupload
  it when relevant.

Improvements for Windows & macOS users:

* When renaming a remote directory by only changing its case, the change was
  applied locally but it was also triggering a weird synchronization loopback
  error. This should now work as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.1-beta.4 - 2018-10-03

Improvements for all users:

- Starting from now, we will be able to automatically receive notifications of
  errors encountered by our users. Error reports won't include user logs in
  order to respect your privacy. We'll still have to ask you individually to
  send us our logs in order to investigate complex issues. But this should help
  us figuring out which errors occur the most, since not so many people can
  find the time to report them. For now, the notifications are only sent for a
  few hard-to-investigate issues, but we'll progressively send more of them.
- Checksums for new local files were computed but not sent during the initial
  upload, possibly delaying detection of content issues. Still the checksum was
  computed by the Cozy and any issue would've be detected during next polling.
  They will now be effectively detected as soon as they should be.

Improvements for macOS users:

- On devices automatically migrated from HFS+ to APFS while upgrading to macOS
  High Sierra, the initial scan was mistakenly detecting some files as conflict
  due to the new way we're detecting case/encoding conflicting files. This
  should now work as expected. This issue could theoretically have happened on
  both macOS & Windows in rare cases of weird local filename changes.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.1-beta.3 - 2018-09-28

Improvements for macOS users:

- A regression on folder moves overwriting their destination was fixed (#1181)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.1-beta.2 - 2018-09-21

Improvements for all users:

- Moves overwriting the destination performed on another device should now be
  synchronized as expected.
- Some part of the synchronization engine dating back to Cozy v2 was not
  necessarily preventing local directory of file overwrites. This part was
  reworked to reach the same level as the other ones, possibly fixing a couple
  of bugs.
- We noticed that synchronizing a local file update to the Cozy could fail in
  some very rare cases. We added a few automatic verifications which should
  help us narrow the issue, so hopefully we'll be able to definitely fix it in
  another release.

Improvements for Windows and macOS users:

- Making the whole or some filename part upper/lower case used to be notably
  unsupported. It should now work everywhere.
- When two files and/or directories with only upper/lower case differences in
  their names are coexisting on your Cozy, only one of them will be
  synchronized locally on your case-preservative OS and the other one will be
  renamed as a conflict so you at least have a way to end up with the exact
  same tree on your Cozy and all your devices.

Improvements for macOS and GNU/Linux users:

- Local files made non-executable will now effectively be synced as
  non-executable on the Cozy and your other devices.
- Please note that currently the permissions of your local files may be forced
  to 755 or 644, depending on the *executable* status. However this should not
  be a major issue, unless your made both your personal directory and your
  *Cozy Drive* directory accessible to other users on your device. We'll
  definitely come up with a better solution at some point to make the
  executable bits match your existing local read/write ones.

Improvements for Windows users:

- Files made (non-)executable on another macOS or GNU/Linux device were
  triggering useless synchronization cycles (or conflict in the worst case).
  This should now work as expected.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.1-beta.1 - 2018-08-16

Improvements for all users:

- Fix synchronization bugs when merging and overwriting folders.

Improvements for macOS users:

- Better support for APFS

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.0 - 2018-07-20

Improvements for all users:

- Improved timestamp conflict handling (see [3.9.0-beta.1][3.9.0-beta.1])
- New diff-based data comparison algorithm (see [3.9.0-beta.1][3.9.0-beta.1])
- Improved file move + overwrite handling (see [3.9.0-beta.2][3.9.0-beta.2])
- New TOS update dialog (see [3.9.0-beta.2][3.9.0-beta.2])

Improvements for Windows & macOS users:

- Initial scan properly ignores platform-incompatible remote files (see [3.9.0-beta.1][3.9.0-beta.1])

Note for GNOME 3.28 or later users:

- Better use TopIcons, not TopIcons-Plus (see [3.9.0-beta.1][3.9.0-beta.1])

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

[3.9.0-beta.1]: https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.0-beta.1
[3.9.0-beta.2]: https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.9.0-beta.2

## 3.9.0-beta.2 - 2018-07-19

Improvements for all users:

- Moving a file to overwrite an existing one is now effectively synchronized
  as expected.
- Users don't look at the systray popover so often. So people who have not
  accepted the new TOS may be unaware that the synchronization is currently
  paused. The app now shows up a reminder dialog on start when appropriate.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.9.0-beta.1 - 2018-07-17

Improvements for all users:

- When a file or directory exists in the cozy, the app will never try to
  assign it an older timestamp anymore. This will ensure synchronization still
  works, even when the local timestamp is actually more accurate than the remote
  one. We'll later introduce a way to save the correct timestamp without being
  rejected by the Cozy.
- The data comparison algorithm is now diff-based. This will help us investigate
  a very rare (but hard to fix) bug where a file is detected as modified while
  no change is actually visible.

Improvements for Windows & macOS users:

- When a file or directory couldn't not be synchronized locally because of
  some platform incompatibility (e.g. reserved character), it will be properly
  ignored during initial scan after restarting the app.

Improvements for support:

- Summarized and detailed traces are now always stored together to make
  analysis easier.

Note for GNOME 3.28 or later users:

- You may have to switch from TopIcons-Plus back to good old TopIcons in case
  the app doesn't show up when clicking on the tray icon, whatever the app
  version.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.8.1 - 2018-07-02

There was no 3.8.0 stable release since we had to release a 3.8.1-alpha first.
So 3.8.1 is the first stable release since 3.7.0.

Improvements for all users:

- When a change could not be applied on the other side, the document was not
  considered up-to-date anymore on the source side. This was fixed as part of
  the [3.8.0-beta.1 release][3.8.0-beta.1].

Improvements for Windows users:

- Office temporary files should be effectively ignored since
  [3.8.0-beta.1][3.8.0-beta.1] too.

Improvements for macOS users:

- In macOS 10.13 (High Sierra), Apple removed the feature we were using to add
  the *Cozy Drive* directory to the Finder's favorite items. We had to find
  another way to bring it back. It should work as expected now.

Improvements for developers / contributors:

- One step less to build the app: `yarn build:core` is not needed anymore. If
  you were using `yarn build`, it should work the same as before. But now you
  won't have to rebuild in case of a core change before running the GUI.
  Less dependencies. Shorter stacktraces. This also fixed a few oddities.
- We also improved logs and jq filters.

See also [known issues][KNOWN_ISSUES.md].

Happy syncing!

## 3.8.0-beta.1 - 2018-06-25

Improvements for all users:

- When a file could not be uploaded/downloaded that may generate conflicts when editing/saving a file multiple times.
- Ignored files (e.g. Office temporary files) should now be effectively ignored on Windows.

Improvements for Arch Linux users:

- You should now be able to install `cozy-desktop` from community repo, courtesy of ArchangeGabriel. Huge thanks to him!

See also [known issues][KNOWN_ISSUES.md].

Happy syncing!

## 3.7.0 - 2018-06-13

Improvements for all users:

- Handle [user action required][3.7.0-beta.1] and [action completion][3.7.0-beta.3]
- Make [Auto-Update Error Transparent][3.7.0-beta.2]
- Handle [emptied folder][3.7.0-beta.1]

Please see the previous beta releases for more details.
See also [known issues][KNOWN_ISSUES.md].

Happy syncing!

## 3.7.0-beta.3 - 2018-06-12

Improvements for all users:

- The app should detect (may take between 5 seconds and 1 minute according to
  elapsed time between click inside the app and completion) when required user
  action has been completed (i.e. new TOS validation) and restart
  automatically.

Improvements for developers:

- New jq file extension/gui/issues filters for logs

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.7.0-beta.2 - 2018-04-27

Improvements for all users:

- The app won't display an error in case of an auto-update failure. Errors
  are logged anyway and auto-update will be retried automatically at some
  point.

Improvements for developers:

- Developers won't have to wait for the above error to disappear.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.7.0-beta.1 - 2018-04-27

Improvements for all users:

- The app now detects when the *Cozy Drive* folder was made empty while it
  used to have contents before. Synchronization is stopped. User can either
  restart later in case the folder is a mount point that was not available
  yet, or delete the root folder before restart to actually restart from
  scratch.
- Warnings from the Cozy instance (e.g. TOS updates) are now detected.
  A bottom banner is shown in the UI prompting the user to read the detail
  before the deadline. After the deadline, synchronisation is stopped and
  reading the detail will be mandatory.
- We also fixed an issue that was preventing some errors to be correctly
  written in logs.

Improvements for developers:

- Logs are dumped on failing test (will help debugging random CI issues)
- Upgrade to Go 1.9 & Couchdb 2.1 on Travis CI

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0 - 2018-04-12

See:

- [3.6.0-beta.5](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.6.0-beta.5)
- [3.6.0-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.6.0-beta.4)
- [3.6.0-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.6.0-beta.3)
- [3.6.0-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.6.0-beta.2)
- [3.6.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.6.0-beta.1)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0-beta.5 - 2018-04-05

Improvements for all users:

- Moved & renamed files are now listed in the *Recents* tab.

Improvements for Windows users:

- Starting from this beta release, the app should be signed with our renewed
  certificate.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0-beta.4 - 2018-03-30

Improvements for all users:

- The *Recents* tab is now clearer and more reliable.
- The app will suggest sending support requests from each desktop device you own
  so we can pinpoint multi-device issues.

Improvements for developers & support team:

- You can now filter log entries on multiple path fields (e.g.
  `yarn jq 'filter_path("pattern")'`)
- User-sent logs archive extension now matches the actual format.
- Logs also include less noise.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0-beta.3 - 2018-03-27

Improvements for all users:

- The app won't poll the Cozy anymore when descendant synchronization is
  already in progress.
- Errors occurring during auto-update are now properly reported to the user,
  with a generic message by default and a more specific one whenever possible
  (e.g. permission issue or disk full).
- The app also properly waits for dir trashing to succeed (issue introduced
  in 3.6.0-beta.1).
- The icon used in the systray window header is now the official blue one on
  Windows and GNU/Linux (we still use the symbolic icon on macOS since it
  integrates better with the overall desktop environment).

Improvements for Windows users:

- We set up a temporary workaround for a bug in electron that is preventing
  notifications to show up on Windows.

Improvements for i3wm (and possibly other tiling window managers) users:

- You can now force an option so the systray Window stays visible when loosing
  focus (please look at the [GNU/Linux documentation](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/linux.md#install)
  for more details). Please tell us whether or not it also helps with other
  tiling window managers.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0-beta.2 - 2018-03-22

Improvements for all users:

- The app won't recompute the checksum of a file when its last modification
  date has not changed.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.6.0-beta.1 - 2018-03-19

Improvements for all users:

- Electron was upgraded from 1.7.9 to 1.8.3 (including quite a few security and
  bug fixes).
- The file/directory move synchronization logic (the part that takes
  already-merged metadata changes and turn them into actions on the other side)
  was substantially rewritten to make it more robust and handle more complex
  cases (e.g. moving `a/` to `b/` then `c/` to `a/`, or moving `a/` to `b/` then
  deleting `b/`).
- A file won't be updated when only its mtime changed. This is a first necessary
  step to later stop computing checksums for files with unmodified mtime, making
  the initial scan faster.

Improvements for macOS and BSD users:

- We fixed a weird recurring error that was generating useless logging on every
  run.

Improvements for developers and support team:

- ES6 modules were replaced with node.js ones. This is a first necessary step
  to get rid of Babel, simplify our build process and make stacktraces smaller
  and easier to read.
- The app now waits for the configuration to be loaded before logging full
  client information (not just some part of it).
- We introduced a few [jq](https://stedolan.github.io/jq/) filters to help
  filtering huge logs. Those should work well with multiple huge log files
  (e.g. > 1GB).

## 3.5.0 - 2018-03-12

This is the same release as [3.5.0-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.5.0-beta.4),
but the version has been updated.

Main changes:

- Improved upload reliability
- Files and folders with name starting with a `.` are now ignored by default.
  If this is an issue for you, please contact us and explain your use case.
- Support requests from the app now uploads your logs directly to our servers.
- When a platform-incompatible folder name is fixed, its files are synced too.
- You can choose to sync a non-empty folder.
- You can exit without confirming unattended revocation and try again later.
- We added traces to spot weird blank page issue on Windows, please try with
  this new release and send us your logs.

And more... See previous beta releases for more details:

- [3.5.0-beta.4](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.5.0-beta.4)
- [3.5.0-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.5.0-beta.3)
- [3.5.0-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.5.0-beta.2)
- [3.5.0-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.5.0-beta.1)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.5.0-beta.4 - 2018-03-08

Improvements for all users:

* Files and folders with name starting with a `.` will now be ignored by
  default. We used to blacklist a few special hidden files and folders, but it
  didn't prove an efficient way to prevent unsupported use cases and issues. So
  we decided to go the opposite way. Please report specific issues with as many
  context as possible so we can understand the actual need.
* When sending a support request from the app, your logs are now uploaded
  directly to our own servers. They're not sent by email anymore, so it should
  work even with huge files (although the upload may take some time).
* The app now detects and handle a few file and folder deletion events
  miscategorized by a third-party component (very rare bug).
* A few users where looking for the CLI, not knowing it was actually disabled.
  The documentation was updated to reflect this.

Improvements for Windows and macOS users:

* When taking a folder with a platform-compatible name, renaming it with a
  platform-incompatible name then renaming it back to a compatible one, files
  were still not synced back (it worked in other cases though). This issue is
  fixed now.

Improvements for Windows users:

* We added UI traces to help us spot a weird issue: at least 2 Windows users
  recently reported blank windows when starting the app (at least one of them
  solved the issue by switching to automatic video card selection, but we're
  still investigating). In case you encountered this issue, please try again
  with this new release and send us a support request from the app.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.5.0-beta.3 - 2018-03-02

Improvements for all users:

- A lot of desktop clients were disconnected recently. Although it seems the
  issue is not on the app side, users were forced to disconnect, go through the
  onboarding steps again, and synchronize there whole drive back. The latest
  stable release (v3.4.5) allowed selecting a non empty synced directory to
  lower the impact of this issue. This new beta release allows user to exit the
  app from the revocation notification dialog without actually disconnecting
  and try synchronizing again later.

We apologize for the inconvenience.

## 3.5.0-beta.2 - 2018-03-01

Improvements for all users:

- All dual-screen window positioning issues should be fixed.

Improvements for macOS users:

- Notifications used to be quite broken on macOS. Everything should just work
  now.
- Special `Icon\r` files were not properly ignored during synchronization,
  probably due to a weird bug in some third-party component. Although it could
  make sense to synchronize them between 2 macOS computers, the cozy-stack
  actually doesn't support creating a file with name containing a `\r`
  character. We made sure those files were properly ignored.

Improvements for developers:

- Test reports recently stopped working when run with coverage enabled (e.g. on
  CI). Everything is back to normal.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.5.0-beta.1 - 2018-02-27

Improvements for KDE users:

- the icon is now correctly sized, thanks to @hleroy

Improvements for all users:

- File uploads are now made with `Content-Length` instead of `Transfer: chunked` which should improve stability.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!


## 3.4.4 & 3.4.5 - 2018-02-26

Improvements for all users:

- Allow selection of an non-empty sync dir as a quickfix following the 26/02 forced logout production incident.

The 3.4.4 build was broken.

Also include all changes from [3.4.4-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.4-beta.1), [3.4.4-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.4-beta.2) and
[3.4.3-beta.3](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.4-beta.3).


See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!


## 3.4.4-beta.3 - 2018-02-20

Improvements for all users:

- We added more traces and test cases to help us fix popover positioning issues.
  Please send us a message from the app in case you encounter an issue, so we
  can get your traces and understand your specific case.

Improvements for macOS users:

- Make sure the popover at least shows up to the top right when the reported
  tray icon position is broken (as it seems to happen from time to time).

Improvements for GNOME 3 + Wayland users:

- Show the popover near the top icon, not at the bottom of the screen.

Improvements for KDE users:

- Fix issue preventing the popover to show up when clicking the systray icon
  on KDE (@hleroy)

Improvements for developers & contributors:

- Use unique user agent per client instance, so we can know how many people are
  actually using it.
- Instructions to set up a development environment on Ubuntu (@hleroy)


## 3.4.4-beta.2 - 2018-02-15

Improvements for all users:

- The remaining files counter didn't update anymore when encountering a
  synchronization error. Everything should work as expected now.
- We also fixed a couple of issues regarding the popover positioning. It should
  now properly detect the systray position and orientation. Please tell us in
  case the popover still shows up at weird locations on your desktop.
- We were using a temporary fix for some third-party component to make sure
  auto-update was working on Windows. The issue was fixed upstream and the
  component upgraded. Please tell us in case you still encounter auto-update
  issues, especially on Windows.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.4-beta.1 - 2018-02-12

Improvements for all users:

- When creating a folder with some platform-incompatible character in the name
  (e.g. `:`), then renaming to a valid name, its content is now correctly synchronized.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.3 - 2018-02-12

Improvements for all users:

- Added more logs to better debug performance and compatibilities issues.
- All improvements from [3.4.3-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/3.4.3-beta.1)

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.3-beta.1 - 2018-02-01

Improvements for all users:

- During onboarding, you can now copy whatever URL from your browser pointing to
  your **Cozy-hosted** instance and paste it as your Cozy address in the
  configuration window. When submitted, the application will identify the
  corresponding Cozy address and remove the useless parts for you. Please tell
  us in case you find an URL that doesn't work. Also please note that there is
  no such automation for self-hosted users for now.
- You'll get quicker visual feedback when trying to select a non-empty directory
  as your synced location.
- In some rare cases, users ended up with a few files improperly uploaded to
  their Cozy. Those files were never considered up-to-date by the app,
  triggering useless synchronization cycles. They will now be detected and not
  synchronized indefinitely. Final work to improve upload reliability is planned
  for week 7 or 8.
- Support requests sent from the help form will now include more debugging and
  benchmarking information (including the application & OS versions). Please
  note debugging information only include filenames as usual, and benchmarking
  information only include time spent on various operations. This will help us
  to improve the overall performances.
- The documentation now lists the supported
  [Windows](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/windows.md)
  and [macOS](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/macos.md)
  versions. Work was previously done on the
  [GNU/Linux](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/linux.md#supported-distributions)
  side.
- An issue was fixed were the application was trying to put the focus

Improvements for GNU/Linux users:

- The application now tries to detect and display a user-friendly message when
  the system glibc is too old to run properly. Please note we may possibly try
  to lower the bar regarding the required version at some point.

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2 - 2018-01-24

Improvements for all users:

- Synchronization & a few performance improvements
- Starting the app when already running will show the popover
- The Cozy configuration should be more user-friendly (including automatic address correction)
- Better support for Windows/macOS workspaces
- And more... Please [see](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.7) [the](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.6) [beta](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.5) [releases](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.4) [for](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.3) [more](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.2) [details](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.2-beta.1).

See also [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.7 - 2018-01-24

Improvements for all users

- Improvements on synchronization, especially for moves or when changing files
  on both sides.

Improvements for early adopters with old Cozy instances:

- Recover when Cozy contains invalid data

Improvements for GNU/Linux users:

- We are progressively listing
  [supported distributions](https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/linux.md#supported-distributions).

Improvements for developers:

- `yarn repl` works again, with useful `helpers`, also introduced `yarn cozy-stack`.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.6 - 2018-01-22

Improvements for Unity users:

- You can now open the application from the tray icon.

Improvements for all users:

- Attempting to restart the application will open the popover.
- Improve the design of error case on Cozy address wizard step.
- Minimal performance improvements. More soon!

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.5 - 2018-01-22

Improvements for all users:

- To mitigate performance issues, we temporarily prevented choosing a non-empty
  directory to synchronize.
- Heuristic-based Cozy address correction

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.4 - 2018-01-19

Improvements for all users:

- The onboarding includes a few more improvements for people not familiar with URL.
- We fixed an issue that prevented disconnecting the app from the Cozy.

Improvements for Windows users:

- Files checksum computation will be retried a few times when file is busy.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.3 - 2018-01-19

Improvements for all users:

- The app should now log and recover from remote files with an invalid parent
  directory. This issue was happening rarely and only on old Cozy instances.
- Showing up the popover near the systray could fail in rare cases for unknown
  reasons. We temporarily fixed the issue by falling back to showing the popover
  in the middle of the screen. Please send us a support request from the app in
  case it happens to you, so we can get all the information we were missing to
  fix it for good.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.2 - 2018-01-18

Improvements for all users:

- The app now shows the popover on the current workspace.
- We fixed an edge case where moving files or folders before or after moving
  their source or destination was generating a conflict.
- We also fixed another case where a folder created or moved locally could end
  up with the wrong last modification date.

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.2-beta.1 - 2018-01-18

Improvements for all users:

- It was possible in some specific cases to mess up the synchronization by
  moving around files & folders during the analysis phase. This is fixed now.
  Feel free to move everything around anytime :)
- In some cases, moving then immediately deleting a file was handled as 2
  distinct actions. The file is now directly detected as deleted.
- The Cozy address page shown during onboarding should now be clearer for people
  not familiar with URL.
- When disconnecting then reconnecting to your Cozy, you could eventually see
  your old files for a few seconds in the dashboard. The fix was published in
  an old minor release, but not properly integrated to the subsequent releases.
  This is fixed now.

Improvements for support team & developers:

- Support requests from the app are now sent to the usual support email.
- Code coverage is back

See [known issues](https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md).

Happy syncing!

## 3.4.1 - 2018-01-09

See [3.4.1-beta.1](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.1-beta.1)
and [3.4.1-beta.2](https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.4.1-beta.2)
release notes.

Happy syncing!

## 3.4.1-beta.2 - 2018-01-09

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

[KNOWN_ISSUES.md]: https://github.com/cozy-labs/cozy-desktop/blob/master/KNOWN_ISSUES.md
[code-signing]: https://en.wikipedia.org/wiki/Code_signing
[3.7.0-beta.1]: https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.7.0-beta.1
[3.7.0-beta.2]: https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.7.0-beta.2
[3.7.0-beta.3]: https://github.com/cozy-labs/cozy-desktop/releases/tag/v3.7.0-beta.3
[3.8.0-beta.1]: https://github.com/cozy-labs/cozy-desktop/releases/v3.8.0-beta.1
