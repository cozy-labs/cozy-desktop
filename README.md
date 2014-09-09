# Workflow

```
coffee index.coffee add-remote-cozy http://url.of.my.cozy devicename /sync/directory
coffee index.coffee sync
```

# TODO
* Implement file/folder removal
* Adapt this patch to request-json-light: https://github.com/cozy/request-json/pull/27
* Patch request-json-light to avoid http/https bug
* Download and put binary via request-json-light to avoid memory leak
* Investigate on pouchDB listener limit error
* Handle conflicts properly
* Allow files to be added locally while downloading binary from remote
* Ensure big binaries are not uploaded after being downloaded
