/** The core of the synchronization.
 *
 * Metadata workflow
 * -----------------
 *
 * ![Workflow](../../doc/developer/workflow.png)
 *
 * Cozy-desktop is a nodejs app, written in EcmaScript to be coherent with
 * other cozy codes. As its core, there is a pouchdb database used to keep
 * metadata about files and folders.
 *
 * On the remote cozy, the files and folders are saved in CouchDB. Cozy-desktop
 * listens to the changes feed of CouchDB to be notified of all the metadata
 * changes on the remote cozy. Those metadata are recopied in the local PouchDB.
 *
 * On the local filesystem, the synchronized folder is watched by the
 * {@link module:core/local/watcher|local watcher}. With it, cozy-desktop is
 * notified of all the changes on the file system and can update the pouchdb
 * with the new metadata.
 *
 * Cozy-desktop also uses a changes feed on the local PouchDB. It takes metadata
 * changes one by one, and apply them to the other side. For example, if the last
 * modification date of a folder has changed on the remote cozy, cozy-desktop
 * will update it on the local filesystem.
 *
 * If a new file is added, cozy-desktop will ask one side to provide a nodejs
 * readable stream, and the other side will pipe it to its destination: a file on
 * the local filesytem, or a request to the files on the remote cozy.
 *
 *
 * Conflicts
 * ---------
 *
 * Conflicts can happen. For example, when cozy-desktop is stopped, a file is
 * added on the remote cozy and a different file is added to the local filesystem
 * at the same path. When cozy-desktop will start, it will detect that both the
 * remote cozy instance and the local filesystem have a file for the same path.
 *
 * The conflict resolution is very simple: one of those file is renamed with a
 * `-conflict` suffix. A more evolved solution would have been very hard to
 * secure. And bugs in this part mean losing data, which is very bad. So, we
 * don't try to be smart and prefer a robust solution.
 *
 *
 * Differences between file systems
 * --------------------------------
 *
 * In short, the file systems have some differences between Linux, BSD, OSX and
 * Windows. In short:
 *
 * - The path separator is `/` everywhere, except on Windows where it's `\ `.
 * - Linux and BSD file systems are sensible to the case, OSX and Windows are not
 *   (they preserve the original case, but they consider `foo` and `FOO` to be
 *   the same file).
 * - Linux and BSD use UTF-8 encoding for filenames, with no normalization.
 *   Windows uses UTF-16. OSX does something stupid: UTF-8 with a normalization
 *   that is nearly the unicode NFD, but not exactly.
 * - `/` and the NULL character are forbidden on all the OSes. On Windows, the
 *   list is longer: `"/\*?<>|:`.
 * - They are a bunch more restrictions on Windows:
 *   - the length of a path is limited to 260 characters
 *   - some names are reserved, like `AUX`, `COM1` or `LPT1`
 *   - a file or directory name cannot end with a space or a period.
 *
 * Node.js helps us a bit, but we are on our own for most of the things in this
 * list.
 *
 * For detecting conflicts, we need to know if two paths are the same. With the
 * issue of case sensitivity and NFD normalization, it's not as easy as it seems.
 * For Linux and BSD, we take the path and we put it in the `_id` field. For
 * Windows and OSX, we make the path upper case before putting it in `_id` field.
 * For OSX, we also does a string normalization on this field. Now, when a new
 * file is added, we can check in pouchdb and see if another file has path that
 * will collide with this new path.
 *
 * So, even if `path` and `_id` are very similar, they have distinct roles:
 *
 * - `_id` is the normalized form and is used for comparison of paths
 * - `path` is the prefered form and used for actions on local file system and
 *   remote cozy.
 *
 * The permissions are different on Unix and on Windows. So, the `executable`
 * field is just ignored on Windows.
 *
 *
 * See also
 * --------
 *
 * - [`core/metadata`](./module-core_metadata.html): The metadata schema
 * - [`core/ignore`](./module-core_ignore.html): Ignoring files & folders
 *
 * @module core
 */
