import faker from 'faker';
import fs from 'fs-extra';
import path from 'path';
import should from 'should';

import Cozy from '../helpers/integration';
import Files from '../helpers/files';


describe('Pull', function() {
    this.slow(1000);
    this.timeout(10000);

    before(Cozy.ensurePreConditions);
    before(Files.deleteAll);
    before(Cozy.registerDevice);
    before(Cozy.pull);
    after(Cozy.clean);

    let waitAppear = function(localPath, callback) {
        let interval;
        return interval = setInterval(function() {
            if (fs.existsSync(localPath)) {
                clearInterval(interval);
                return callback();
            }
        }
        , 20);
    };

    let waitDisappear = function(localPath, callback) {
        let interval;
        return interval = setInterval(function() {
            if (!fs.existsSync(localPath)) {
                clearInterval(interval);
                return callback();
            }
        }
        , 20);
    };

    let parent = {
        path: '',
        name: faker.company.bsBuzz()
    };
    let folder = {
        path: '',
        name: faker.company.bsNoun()
    };
    let file = {
        path: '',
        name: faker.company.bsAdjective()
    };

    it('creates a folder on the local fs from the remote cozy', done =>
        Files.createFolder(folder, (err, created) => {
            folder.id = created.id;
            let folderPath = path.join(this.syncPath, folder.path, folder.name);
            return waitAppear(folderPath, function() {
                let stats = fs.statSync(folderPath);
                stats.isDirectory().should.be.true();
                return done();
            });
        }
        )
    );

    it('renames the folder', function(done) {
        let oldPath = path.join(this.syncPath, folder.name);
        folder.name = faker.hacker.noun();
        return Files.updateFolder(folder, (err, updated) => {
            let folderPath = path.join(this.syncPath, folder.path, folder.name);
            return waitAppear(folderPath, function() {
                fs.existsSync(oldPath).should.be.false();
                return done();
            });
        }
        );
    });

    it('moves the folder', function(done) {
        let oldPath = path.join(this.syncPath, folder.name);
        return Files.createFolder(parent, (err, created) => {
            folder.path = parent.name;
            return Files.updateFolder(folder, (err, updated) => {
                let folderPath = path.join(this.syncPath, folder.path, folder.name);
                return waitAppear(folderPath, function() {
                    fs.existsSync(oldPath).should.be.false();
                    return done();
                });
            }
            );
        }
        );
    });

    it('removes the folder', done =>
        Files.removeFolder(folder, (err, removed) => {
            let folderPath = path.join(this.syncPath, folder.path, folder.name);
            return waitDisappear(folderPath, done);
        }
        )
    );

    it('creates a file on the local fs from the remote cozy', function(done) {
        let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg');
        return Files.uploadFile(file, fixturePath, (err, created) => {
            file.id = created.id;
            let filePath = path.join(this.syncPath, file.path, file.name);
            return waitAppear(filePath, function() {
                let stats = fs.statSync(filePath);
                stats.isFile().should.be.true();
                stats.size.should.equal(fs.statSync(fixturePath).size);
                return setTimeout(done, 200);
            });
        }
        );
    });

    it('renames the file', function(done) {
        let oldPath = path.join(this.syncPath, file.name);
        file.name = faker.hacker.noun();
        return Files.updateFile(file, (err, updated) => {
            let filePath = path.join(this.syncPath, file.path, file.name);
            return waitAppear(filePath, function() {
                fs.existsSync(oldPath).should.be.false();
                return done();
            });
        }
        );
    });

    it('moves the file', function(done) {
        let oldPath = path.join(this.syncPath, file.name);
        file.path = parent.name;
        return Files.updateFile(file, (err, updated) => {
            let filePath = path.join(this.syncPath, file.path, file.name);
            return waitAppear(filePath, function() {
                fs.existsSync(oldPath).should.be.false();
                return done();
            });
        }
        );
    });

    return it('removes the file', done =>
        Files.removeFile(file, (err, removed) => {
            let filePath = path.join(this.syncPath, file.path, file.name);
            return waitDisappear(filePath, done);
        }
        )
    );
});
