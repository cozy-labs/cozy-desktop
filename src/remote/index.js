import async from 'async';
import clone from 'lodash.clone';
import crypto from 'crypto';
import path from 'path';
let log     = require('printit')({
    prefix: 'Remote writer ',
    date: true
});

import Couch from './couch';
import Watcher from './watcher';


// Remote is the class that coordinates the interaction with the remote cozy
// instance. It uses a watcher for replicating changes from the remote cozy to
// the local pouchdb. It also applies the changes from the local pouchdb to the
// remote cozy.
//
// Please note that the structure of the documents in the remote couchdb and in
// the local pouchdb are similar, but not exactly the same. A transformation is
// needed in both ways.
class Remote {
    constructor(config, prep, pouch, events) {
        this.start = this.start.bind(this);
        this.createReadStream = this.createReadStream.bind(this);
        this.cleanBinary = this.cleanBinary.bind(this);
        this.addFile = this.addFile.bind(this);
        this.addFolder = this.addFolder.bind(this);
        this.overwriteFile = this.overwriteFile.bind(this);
        this.addOrOverwriteFile = this.addOrOverwriteFile.bind(this);
        this.moveFolder = this.moveFolder.bind(this);
        this.deleteFile = this.deleteFile.bind(this);
        this.deleteFolder = this.deleteFolder.bind(this);
        this.resolveConflict = this.resolveConflict.bind(this);
        this.config = config;
        this.prep = prep;
        this.pouch = pouch;
        this.events = events;
        this.couch   = new Couch(this.config, this.events);
        let deviceName = this.config.getDefaultDeviceName();
        this.watcher = new Watcher(this.couch, this.prep, this.pouch, deviceName);
        this.other   = null;
    }

    // Start initial replication + watching changes in live
    start(done) {
        return this.watcher.listenToChanges({live: false}, err => {
            done(err);
            if (!err) {
                this.watching = true;
                return this.watcher.listenToChanges({live: true}, () => {
                    return this.watching = false;
                }
                );
            }
        }
        );
    }

    // Stop listening to couchdb changes
    stop(callback) {
        let interval;
        this.watcher.stopListening();
        return interval = setInterval(() => {
            if (!this.watching) {
                clearInterval(interval);
                return callback();
            }
        }
        , 100);
    }

    // Create a readable stream for the given doc
    createReadStream(doc, callback) {
        if (doc.remote.binary != null) {
            return this.couch.downloadBinary(doc.remote.binary._id, callback);
        } else {
            return callback(new Error('Cannot download the file'));
        }
    }


    /* Helpers */

    // Add attachment to the binary document by uploading a file
    addAttachment(doc, binary, callback) {
        let done = err => {
            let cb;
            [cb, callback] = [callback, function() {}];  // Be sure to callback only once
            if (err) {
                return this.couch.remove(binary._id, binary._rev, () => cb(err));
            } else {
                return cb(err, binary);
            }
        };

        // Don't use async callback here!
        // Async does some magic and the stream can throw an 'error'
        // event before the next async callback is called...
        return this.other.createReadStream(doc, (err, stream) => {
            if (err) { return callback(err); }
            stream.on('error', () => callback(new Error('Invalid file')));
            // Be sure that the checksum is correct
            let checksum = crypto.createHash('sha1');
            checksum.setEncoding('hex');
            stream.pipe(checksum);
            stream.on('end', function() {
                checksum.end();
                if (checksum.read() !== doc.checksum) {
                    return done(new Error('Invalid checksum'));
                }
            });
            // Emit events to track the download progress
            let info = clone(doc);
            info.way = 'up';
            info.eventName = `transfer-up-${doc._id}`;
            this.events.emit('transfer-started', info);
            stream.on('data', data => {
                return this.events.emit(info.eventName, data);
            }
            );
            stream.on('close', () => {
                return this.events.emit(info.eventName, {finished: true});
            }
            );
            let {_id, _rev} = binary;
            let mime = doc.mime || 'application/octet-stream';
            return this.couch.uploadAsAttachment(_id, _rev, mime, stream, done);
        }
        );
    }


    // Upload the binary as a CouchDB document's attachment and return
    // the binary document
    uploadBinary(doc, callback) {
        log.info(`Upload binary ${doc.checksum}`);
        let binary = {
            _id: doc.checksum,
            docType: 'Binary',
            checksum: doc.checksum
        };

        return this.couch.put(binary, (err, created) => {
            if (__guard__(err, x => x.status) === 409) {
                return this.couch.get(binary._id, (err, binaryDoc) => {
                    if (binaryDoc._attachments) {
                        return callback(null, binaryDoc);
                    } else {
                        binary._rev = binaryDoc._rev;
                        return this.addAttachment(doc, binary, callback);
                    }
                }
                );
            } else if (err) {
                return callback(err);
            } else {
                binary._rev = created.rev;
                return this.addAttachment(doc, binary, callback);
            }
        }
        );
    }


    // Extract the remote path and name from a local id
    extractDirAndName(id) {
        let dir = path.dirname(`/${id}`);
        let name = path.basename(id);
        if (dir === '/') { dir = ''; }
        return [dir, name];
    }

    // Transform a local document in a remote one, with optional binary ref
    createRemoteDoc(local, remote) {
        let [dir, name] = this.extractDirAndName(local.path);
        let doc = {
            docType: local.docType,
            path: dir,
            name,
            creationDate: local.creationDate,
            lastModification: local.lastModification
        };
        for (let field of ['checksum', 'size', 'class', 'mime', 'tags', 'localPath']) {
            if (local[field]) { doc[field] = local[field]; }
        }
        if (local.executable) { doc.executable = true; }
        if (remote) {
            doc._id = remote._id;
            doc._rev = remote._rev;
            if (remote.binary) {
                doc.binary = {
                    file: {
                        id:  remote.binary._id,
                        rev: remote.binary._rev
                    }
                };
            }
        }
        if (doc._id == null) { doc._id = Couch.newId(); }
        return doc;
    }

    // Remove the binary if it is no longer referenced
    cleanBinary(binaryId, callback) {
        return this.couch.get(binaryId, (err, doc) => {
            if (err) {
                return callback(err);
            } else {
                return this.pouch.byChecksum(doc.checksum, (err, files) => {
                    if (err || (files.length !== 0)) {
                        return callback(err);
                    } else {
                        return this.couch.remove(doc._id, doc._rev, callback);
                    }
                }
                );
            }
        }
        );
    }

    // Return true if the remote file is up-to-date for this document
    isUpToDate(doc) {
        let currentRev = doc.sides.remote || 0;
        let lastRev = this.pouch.extractRevNumber(doc);
        return currentRev === lastRev;
    }


    /* Write operations */

    // Create a file on the remote cozy instance
    // It can also be an overwrite of the file
    addFile(doc, callback) {
        log.info(`Add file ${doc.path}`);
        return this.addOrOverwriteFile(doc, null, callback);
    }

    // Create a folder on the remote cozy instance
    addFolder(doc, callback) {
        log.info(`Add folder ${doc.path}`);
        let folder = this.createRemoteDoc(doc);
        return this.couch.put(folder, function(err, created) {
            if (!err) {
                doc.remote = {
                    _id:  created.id,
                    _rev: created.rev
                };
            }
            return callback(err, created);
        });
    }

    // Overwrite a file
    overwriteFile(doc, old, callback) {
        log.info(`Overwrite file ${doc.path}`);
        return this.addOrOverwriteFile(doc, old, callback);
    }

    // Add or overwrite a file
    addOrOverwriteFile(doc, old, callback) {
        let binary, remote;
        return async.waterfall([
            // Find or create the binary doc
            next => {
                return this.pouch.byChecksum(doc.checksum, (err, files) => {
                    binary = null;
                    for (let file of Array.from(files || [])) {
                        if (this.isUpToDate(file)) {
                            ({ binary } = file.remote);
                        }
                    }
                    if (binary) {
                        this.events.emit('transfer-copy', doc);
                        return next(null, binary);
                    } else {
                        return this.uploadBinary(doc, next);
                    }
                }
                );
            },

            // Check that the file was not removed/deleted while uploaded
            (binaryDoc, next) => {
                return this.pouch.db.get(doc._id, err => {
                    if (err) {
                        return this.cleanBinary(binaryDoc._id, () => next(err));
                    } else {
                        return next(null, binaryDoc);
                    }
                }
                );
            },

            // Save the 'file' document in the remote couch
            (binaryDoc, next) => {
                remote = {
                    _id:  __guard__(doc.remote, x => x._id)  || __guard__(old, x1 => x1.remote._id),
                    _rev: __guard__(doc.remote, x2 => x2._rev) || __guard__(old, x3 => x3.remote._rev),
                    binary: binaryDoc
                };
                let remoteDoc = this.createRemoteDoc(doc, remote);
                let remoteOld = {};
                if (old) { remoteOld = this.createRemoteDoc(old); }
                return this.couch.putRemoteDoc(remoteDoc, remoteOld, (err, created) => next(err, created, binaryDoc));
            },

            // Save remote and clean previous binary
            (created, binaryDoc, next) => {
                doc.remote = {
                    _id:  created.id,
                    _rev: created.rev,
                    binary: {
                        _id:  binaryDoc._id,
                        _rev: binaryDoc._rev
                    }
                };
                if (__guard__(old, x => x.remote)) {
                    return this.cleanBinary(old.remote.binary._id, next);
                } else {
                    return next(null, created);
                }
            }
        ], callback);
    }

    // Update the metadata of a file
    updateFileMetadata(doc, old, callback) {
        log.info(`Update file ${doc.path}`);
        if (old.remote) {
            let remoteDoc = this.createRemoteDoc(doc, old.remote);
            let remoteOld = {};
            if (old) { remoteOld = this.createRemoteDoc(old); }
            return this.couch.putRemoteDoc(remoteDoc, remoteOld, function(err, updated) {
                if (!err) {
                    doc.remote = {
                        _id:  updated.id,
                        _rev: updated.rev,
                        binary: old.remote.binary
                    };
                }
                return callback(err, updated);
            });
        } else {
            return this.addFile(doc, callback);
        }
    }

    // Update metadata of a folder
    updateFolder(doc, old, callback) {
        log.info(`Update folder ${doc.path}`);
        if (old.remote) {
            return this.couch.get(old.remote._id, (err, folder) => {
                if (err) {
                    return callback(err);
                } else {
                    folder.tags = doc.tags;
                    folder.lastModification = doc.lastModification;
                    return this.couch.put(folder, function(err, updated) {
                        if (!err) {
                            doc.remote = {
                                _id:  updated.id,
                                _rev: updated.rev
                            };
                        }
                        return callback(err, updated);
                    });
                }
            }
            );
        } else {
            return this.addFolder(doc, callback);
        }
    }

    // Move a file on the remote cozy instance
    moveFile(doc, old, callback) {
        log.info(`Move file ${old.path} → ${doc.path}`);
        if (old.remote) {
            return this.couch.get(old.remote._id, (err, remoteDoc) => {
                if (err) {
                    return this.addFile(doc, callback);
                } else {
                    let [dir, name] = this.extractDirAndName(doc.path);
                    remoteDoc.path = dir;
                    remoteDoc.name = name;
                    remoteDoc.lastModification = doc.lastModification;
                    return this.couch.put(remoteDoc, (err, moved) => {
                        if (!err) {
                            this.events.emit('transfer-move', doc, old);
                            doc.remote = {
                                _id: moved.id,
                                _rev: moved.rev,
                                binary: old.remote.binary
                            };
                        }
                        return callback(err, moved);
                    }
                    );
                }
            }
            );
        } else {
            return this.addFile(doc, callback);
        }
    }

    // Move a folder on the remote cozy instance
    moveFolder(doc, old, callback) {
        log.info(`Move folder ${old.path} → ${doc.path}`);
        if (old.remote) {
            return this.couch.get(old.remote._id, (err, folder) => {
                if (err) {
                    return callback(err);
                } else {
                    let [dir, name] = this.extractDirAndName(doc.path);
                    folder.path = dir;
                    folder.name = name;
                    folder.tags = doc.tags;
                    folder.lastModification = doc.lastModification;
                    return this.couch.put(folder, callback);
                }
            }
            );
        } else {
            return this.addFolder(doc, callback);
        }
    }

    // Delete a file on the remote cozy instance
    deleteFile(doc, callback) {
        log.info(`Delete file ${doc.path}`);
        this.events.emit('delete-file', doc);
        if (!doc.remote) { return callback(); }
        let remoteDoc = this.createRemoteDoc(doc, doc.remote);
        return this.couch.removeRemoteDoc(remoteDoc, (err, removed) => {
            // Ignore files that have already been removed
            if (__guard__(err, x => x.status) === 404) {
                return callback(null, removed);
            } else if (err) {
                return callback(err, removed);
            } else {
                return this.cleanBinary(doc.remote.binary._id, err => callback(null, removed));
            }
        }
        );
    }

    // Delete a folder on the remote cozy instance
    deleteFolder(doc, callback) {
        log.info(`Delete folder ${doc.path}`);
        if (doc.remote) {
            let remoteDoc = this.createRemoteDoc(doc, doc.remote);
            remoteDoc._deleted = true;
            return this.couch.put(remoteDoc, function(err, removed) {
                // Ignore folders that have already been removed
                if (__guard__(err, x => x.status) === 404) {
                    return callback(null, removed);
                } else {
                    return callback(err, removed);
                }
            });
        } else {
            return callback();
        }
    }

    // Rename a file/folder to resolve a conflict
    resolveConflict(dst, src, callback) {
        log.info(`Resolve a conflict: ${src.path} → ${dst.path}`);
        return this.couch.get(src.remote._id, (err, doc) => {
            let [dir, name] = this.extractDirAndName(dst.path);
            doc.path = dir;
            doc.name = name;
            return this.couch.put(doc, callback);
        }
        );
    }
}


export default Remote;

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}