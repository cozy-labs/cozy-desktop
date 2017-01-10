import path from 'path';

import Pouch from '../../src/pouch';


export default {
    createDatabase(done) {
        this.pouch = new Pouch(this.config);
        return this.pouch.addAllViews(done);
    },

    cleanDatabase(done) {
        this.pouch.db.destroy(() => {
            this.pouch = null;
            return done();
        }
        );
    },

    createParentFolder(pouch, callback) {
        let doc = {
            _id: 'my-folder',
            path: 'my-folder',
            docType: 'folder',
            creationDate: new Date(),
            lastModification: new Date(),
            tags: []
        };
        pouch.db.put(doc, callback);
    },

    createFolder(pouch, i, callback) {
        let id = path.join('my-folder', `folder-${i}`);
        let doc = {
            _id: id,
            path: id,
            docType: 'folder',
            creationDate: new Date(),
            lastModification: new Date(),
            tags: [],
            remote: {
                _id: `123456789${i}`
            }
        };
        pouch.db.put(doc, callback);
    },

    createFile(pouch, i, callback) {
        let id = path.join('my-folder', `file-${i}`);
        let doc = {
            _id: id,
            path: id,
            docType: 'file',
            checksum: `111111111111111111111111111111111111111${i}`,
            creationDate: new Date(),
            lastModification: new Date(),
            tags: [],
            remote: {
                _id: `1234567890${i}`
            }
        };
        pouch.db.put(doc, callback);
    }
};
