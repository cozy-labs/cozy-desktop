# Known Issues

Please report any other issue you may encounter by using the app help form.

**Known issues** that should be fixed in upcoming releases:

* Trashing, restoring and deleting content permanently may not work as expected
  yet, especially regarding shared folders and connectors.
  [details](https://trello.com/c/6jfO4hoB)
* Moving or renaming multiple files or directories successively may end up
  with duplicate content. [details](https://trello.com/c/ZTD669wz)
* Changing only the case or encoding in a file or directory name, e.g. renaming
  *my stuff* to *MY STUFF*, won't be synchronized on other devices.
  [details](https://trello.com/c/Phc3lLEr)

**Performance issues**:

* The app now takes some time before actually syncing, may hold on until
  there is no more activity, and uses a lot of CPU on start and when syncing.
  [details](https://trello.com/c/IQEImXQF)
* Actions involving lots of content may take too much time to complete or use
  too much resources. But adding 100000 files or moving 50000 files should
  still work. [details](https://trello.com/c/IQEImXQF)

**Issues** caused by lower-level bugs that will be **harder to fix or circumvent**:

* Replacing a directory with a file of the same name won't work (same when
  replacing a file with a directory of the same name).
  [details](https://trello.com/c/rBQ2XXwp)
* When moving 2 directories at the same time on Windows, possibly only 1 move
  may be detected. [details](https://trello.com/c/X3QMUQO3)
