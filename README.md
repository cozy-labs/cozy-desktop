# Workflow

```
coffee index.coffee add-remote-cozy http://url.of.my.cozy devicename /sync/directory
coffee index.coffee watch-remote -b devicename # To get live modifications from remote and fetch binaries
coffee index.coffee watch-local devicename # To send modifications to remote automatically
```

# TODO
* Implement file/folder removal
* Merge https://github.com/cozy/request-json/pull/27
