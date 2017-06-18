# Multiple synchronized directories

Cozy-desktop keeps the metadata in a pouchdb database. If you want to use
several synchronized directories, you'll have to tell cozy-desktop to keeps
its metadata database somewhere else. The `COZY_DESKTOP_DIR` env variable has
this role.

For example, if you want to add a second synchronized directory, you can do:

```bash
export COZY_DESKTOP_DIR=/sync/other
cozy-desktop add-remote-cozy https://url.of.my.others.cozy/ /sync/other
cozy-desktop sync
```
