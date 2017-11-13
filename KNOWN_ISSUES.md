# Known Issues

Please report any other issue you may encounter by using the app help form.

**Known issues** that should be fixed in upcoming releases:

* Trashing, restoring and deleting content permanently may not work as expected
  yet. [details](https://trello.com/c/6jfO4hoB)
* Moving or renaming multiple files or directories successively may end up
  with duplicate content. [details](https://trello.com/c/ZTD669wz)
* Changing the case of a file or directory name, e.g. renaming *my stuff* to
  *MY STUFF*, will create a conflict. [details](https://trello.com/c/Phc3lLEr)
* Deleting content on both sides generates useless errors that slow down the
  synchronization. [details](https://trello.com/c/wYoxynqg)
* The remote Cozy overloading guard is too aggressive (waiting far too long in
  case of synchronization errors). [details](https://trello.com/c/SSi06JwO)

**Performance issues**:

* The app now takes some time before actually syncing, may hold on until
  there is no more activity, and uses a lot of CPU on start and when syncing.
  [details](https://trello.com/c/IQEImXQF)
* Actions involving lots of content may take too much time to complete or use
  too much resources. Currently, adding 50000 files or moving 25000 files should
  work. [details](https://trello.com/c/IQEImXQF)

**Issues** caused by lower-level bugs that will be **harder to fix or circumvent**:

* Replacing a directory with a file of the same name won't work (same when
  replacing a file with a directory of the same name).
  [details](https://trello.com/c/rBQ2XXwp)
* When moving 2 directories at the same time on Windows, possibly only 1 move
  may be detected. [details](https://trello.com/c/X3QMUQO3)
