import async from 'async';
import { device } from 'cozy-device-sdk';
let log    = require('printit')({
    prefix: 'Synchronize   ',
    date: true
});


// Sync listens to PouchDB about the metadata changes, and calls local and
// remote sides to apply the changes on the filesystem and remote CouchDB
// respectively.
class Sync {

    constructor(pouch, local, remote, ignore, events) {
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.sync = this.sync.bind(this);
        this.pop = this.pop.bind(this);
        this.apply = this.apply.bind(this);
        this.selectSide = this.selectSide.bind(this);
        this.applied = this.applied.bind(this);
        this.fileChanged = this.fileChanged.bind(this);
        this.folderChanged = this.folderChanged.bind(this);
        this.pouch = pouch;
        this.local = local;
        this.remote = remote;
        this.ignore = ignore;
        this.events = events;
        this.local.other = this.remote;
        this.remote.other = this.local;
    }

    // Start to synchronize the remote cozy with the local filesystem
    // First, start metadata synchronization in pouch, with the watchers
    // Then, when a stable state is reached, start applying changes from pouch
    //
    // The mode can be:
    // - pull if only changes from the remote cozy are applied to the fs
    // - push if only changes from the fs are applied to the remote cozy
    // - full for the full synchronization of the both sides
    //
    // The callback is called only for an error
    start(mode, callback) {
        this.stopped = false;
        let tasks = [
            next => this.pouch.addAllViews(next)
        ];
        if (mode !== 'pull') { tasks.push(this.local.start); }
        if (mode !== 'push') { tasks.push(this.remote.start); }
        return async.waterfall(tasks, err => {
            if (err) {
                return callback(err);
            } else {
                return async.forever(this.sync, callback);
            }
        }
        );
    }

    // Stop the synchronization
    stop(callback) {
        this.stopped = true;
        if (this.changes) {
            this.changes.cancel();
            this.changes = null;
        }
        return async.parallel([
            done => this.local.stop(done),
            done => this.remote.stop(done)
        ], callback);
    }

    // Start taking changes from pouch and applying them
    sync(callback) {
        return this.pop((err, change) => {
            if (this.stopped) { return; }
            if (err) {
                log.error(err);
                return callback(err);
            } else {
                return this.apply(change, function(err) {
                    if (this.stopped) { err = null; }
                    return callback(err);
                });
            }
        }
        );
    }

    // Take the next change from pouch
    // We filter with the byPath view to reject design documents
    //
    // Note: it is difficult to pick only one change at a time because pouch can
    // emit several docs in a row, and `limit: 1` seems to be not effective!
    pop(callback) {
        return this.pouch.getLocalSeq((err, seq) => {
            if (err) { return callback(err); }
            let opts = {
                limit: 1,
                since: seq,
                include_docs: true,
                filter: '_view',
                view: 'byPath'
            };
            return this.pouch.db.changes(opts)
                .on('change', info => callback(null, info))
                .on('error', err => callback(err))
                .on('complete', info => {
                    if (__guard__(info.results, x => x.length)) { return; }
                    this.events.emit('up-to-date');
                    log.info('Your cozy is up to date!');
                    opts.live = true;
                    opts.returnDocs = false;
                    return this.changes = this.pouch.db.changes(opts)
                        .on('change', info => {
                            if (this.changes) {
                                this.changes.cancel();
                                this.changes = null;
                                return callback(null, info);
                            }
                        }
                    )
                        .on('error', err => {
                            if (this.changes) {
                                this.changes = null;
                                return callback(err, null);
                            }
                        }
                    );
                }
            );
        }
        );
    }

    // Apply a change to both local and remote
    // At least one side should say it has already this change
    // In some cases, both sides have the change
    apply(change, callback) {
        log.info('apply', change);
        let { doc } = change;

        if (this.ignore.isIgnored(doc)) {
            this.pouch.setLocalSeq(change.seq, err => callback());
            return;
        }

        let [side, sideName, rev] = this.selectSide(doc);
        let done = this.applied(change, sideName, callback);

        switch (false) {
            case !!side:
                return this.pouch.setLocalSeq(change.seq, callback);
            case doc.docType !== 'file':
                return this.fileChanged(doc, side, rev, done);
            case doc.docType !== 'folder':
                return this.folderChanged(doc, side, rev, done);
            default:
                return callback(new Error(`Unknown doctype: ${doc.docType}`));
        }
    }

    // Select which side will apply the change
    // It returns the side, its name, and also the last rev applied by this side
    selectSide(doc) {
        let localRev  = doc.sides.local  || 0;
        let remoteRev = doc.sides.remote || 0;
        if (localRev > remoteRev) {
            return [this.remote, 'remote', remoteRev];
        } else if (remoteRev > localRev) {
            return [this.local, 'local', localRev];
        } else {
            log.info('Nothing to do');
            return [];
        }
    }

    // Keep track of the sequence number, save side rev, and log errors
    applied(change, side, callback) {
        return err => {
            if (err) { log.error(err); }
            if (__guard__(err, x => x.code) === 'ENOSPC') {
                return callback(new Error('The disk space on your computer is full!'));
            } else if (__guard__(err, x1 => x1.status) === 401) {
                return callback(new Error('The device is no longer registered'));
            } else if (err) {
                if (!change.doc.errors) { change.doc.errors = 0; }
                return this.isCozyFull((err, full) => {
                    if (err) {
                        return this.remote.couch.ping(available => {
                            if (available) {
                                return this.updateErrors(change, callback);
                            } else {
                                return this.remote.couch.whenAvailable(callback);
                            }
                        }
                        );
                    } else if (full) {
                        return callback(new Error('Your Cozy is full! ' +
                            'You can delete some files to be able' +
                            'to add new ones or upgrade your storage plan.'
                        )
                        );
                    } else {
                        return this.updateErrors(change, callback);
                    }
                }
                );
            } else {
                log.info(`Applied ${change.seq}`);
                return this.pouch.setLocalSeq(change.seq, err => {
                    if (err) { log.error(err); }
                    if (change.doc._deleted) {
                        return callback(err);
                    } else {
                        return this.updateRevs(change.doc, side, callback);
                    }
                }
                );
            }
        };
    }

    // Says is the Cozy has no more free disk space
    isCozyFull(callback) {
        return this.getDiskSpace(function(err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, ['', '0'].includes(res.diskSpace.freeDiskSpace));
            }});
    }

    // Increment the counter of errors for this document
    updateErrors(change, callback) {
        let { doc } = change;
        doc.errors++;
        // Don't try more than 10 times for the same operation
        if (doc.errors >= 10) {
            this.pouch.setLocalSeq(change.seq, callback);
            return;
        }
        return this.pouch.db.put(doc, err => {
            // If the doc can't be saved, it's because of a new revision.
            // So, we can skip this revision
            if (err) {
                log.info(`Ignored ${change.seq}`, err);
                this.pouch.setLocalSeq(change.seq, callback);
                return;
            }
            // The sync error may be due to the remote cozy being overloaded.
            // So, it's better to wait a bit before trying the next operation.
            return setTimeout(callback, 3000);
        }
        );
    }

    // Update rev numbers for both local and remote sides
    updateRevs(doc, side, callback) {
        let rev = this.pouch.extractRevNumber(doc) + 1;
        for (let s of ['local', 'remote']) {
            doc.sides[s] = rev;
        }
        delete doc.errors;
        return this.pouch.db.put(doc, err => {
            // Conflicts can happen here, for example if the data-system has
            // generated a thumbnail before apply has finished. In that case, we
            // try to reconciliate the documents.
            if (__guard__(err, x => x.status) === 409) {
                return this.pouch.db.get(doc._id, (err, doc) => {
                    if (err) {
                        log.warn('Race condition', err);
                        return callback();
                    } else {
                        doc.sides[side] = rev;
                        return this.pouch.db.put(doc, function(err) {
                            if (err) { log.warn('Race condition', err); }
                            return callback();
                        });
                    }
                }
                );
            } else {
                if (err) { log.warn('Race condition', err); }
                return callback();
            }
        }
        );
    }

    // If a file has been changed, we had to check what operation it is.
    // For a move, the first call will just keep a reference to the document,
    // and only at the second call, the move operation will be executed.
    fileChanged(doc, side, rev, callback) {
        let from;
        switch (false) {
            case !doc._deleted || (rev !== 0):
                return callback();
            case !this.moveFrom:
                [from, this.moveFrom] = [this.moveFrom, null];
                if (from.moveTo === doc._id) {
                    return side.moveFile(doc, from, err => {
                        if (err) { this.moveFrom = from; }
                        return callback(err);
                    }
                    );
                } else {
                    log.error("Invalid move");
                    log.error(from);
                    log.error(doc);
                    return side.addFile(doc, function(err) {
                        if (err) { log.error(err); }
                        return side.deleteFile(from, function(err) {
                            if (err) { log.error(err); }
                            return callback(new Error('Invalid move'));
                        });
                    });
                }
            case !doc.moveTo:
                this.moveFrom = doc;
                return callback();
            case !doc._deleted:
                return side.deleteFile(doc, callback);
            case rev !== 0:
                return side.addFile(doc, callback);
            default:
                return this.pouch.getPreviousRev(doc._id, rev, function(err, old) {
                    if (err) {
                        return side.overwriteFile(doc, old, callback);
                    } else if (old.checksum === doc.checksum) {
                        return side.updateFileMetadata(doc, old, callback);
                    } else if (old.remote && !old.checksum) {
                        // Photos uploaded by cozy-mobile have no checksum,
                        // but it's useless to reupload the binary
                        return side.updateFileMetadata(doc, old, callback);
                    } else {
                        return side.overwriteFile(doc, old, callback);
                    }
                });
        }
    }

    // Same as fileChanged, but for folder
    folderChanged(doc, side, rev, callback) {
        let from;
        switch (false) {
            case !doc._deleted || (rev !== 0):
                return callback();
            case !this.moveFrom:
                [from, this.moveFrom] = [this.moveFrom, null];
                if (from.moveTo === doc._id) {
                    return side.moveFolder(doc, from, err => {
                        if (err) { this.moveFrom = from; }
                        return callback(err);
                    }
                    );
                } else {
                    log.error("Invalid move");
                    log.error(from);
                    log.error(doc);
                    return side.addFolder(doc, function(err) {
                        if (err) { log.error(err); }
                        return side.deleteFolder(from, function(err) {
                            if (err) { log.error(err); }
                            return callback(new Error('Invalid move'));
                        });
                    });
                }
            case !doc.moveTo:
                this.moveFrom = doc;
                return callback();
            case !doc._deleted:
                return side.deleteFolder(doc, callback);
            case rev !== 0:
                return side.addFolder(doc, callback);
            default:
                return this.pouch.getPreviousRev(doc._id, rev, (err, old) => side.updateFolder(doc, old, callback));
        }
    }
}


export default Sync;

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}