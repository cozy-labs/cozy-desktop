child  = require 'child_process'
clone  = require 'lodash.clone'
del    = require 'del'
faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

App   = require '../../src/app'
Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


deviceNames = [
    "test#{faker.commerce.color()}1"
    "test#{faker.commerce.color()}2"
]

folders = [
    path.join Cozy.parentDir, 'one'
    path.join Cozy.parentDir, 'two'
]

logs = [
    path.join Cozy.parentDir, 'one.log'
    path.join Cozy.parentDir, 'two.log'
]


# Register a device on cozy
registerDevice = (i, callback) ->
    app = new App folders[i]
    app.askPassword = (callback) ->
        callback null, Cozy.password
    app.addRemote Cozy.url, folders[i], deviceNames[i], callback

# Remove a device from cozy
removeRemoteDevice = (i, callback) ->
    app = new App folders[i]
    app.askPassword = (callback) ->
        callback null, Cozy.password
    app.removeRemote deviceNames[i], callback


# Spawn a cozy-desktop instance
spawnCozyDesktop = (i, callback) ->
    log = fs.createWriteStream logs[i]
    log.on 'open', ->
        bin = path.resolve 'src/bin/cli.coffee'
        args = ['sync']
        env = clone process.env
        env.COZY_DESKTOP_DIR = folders[i]
        env.NODE_ENV = 'test'
        opts =
            cwd: folders[i]
            env: env
            stdio: ['ignore', log, log]
        pid = child.spawn bin, args, opts
        callback pid

# Stop a cozy-desktop instance
stopCozyDesktop = (pid, callback) ->
    pid.on 'exit', callback
    pid.kill()


# In this test, we launch 2 cozy-desktops in two directories, and make them
# synchronize via a central cozy instance. During ~20 seconds, we do some
# operations in both directory (like creating files, or moving folders).
# After that, we wait 10 seconds and we compare the 2 directories. They should
# be identical: same files and folders.
describe 'Property based testing', ->
    @timeout 60000

    before Cozy.ensurePreConditions
    before Files.deleteAll

    it 'creates the directories for both instances', (done) ->
        fs.ensureDirSync folders[0]
        fs.ensureDirSync folders[1]
        fs.ensureDirSync path.join(folders[0], 'foo')
        # TODO fill one and two with some files and folders
        done()

    it 'registers two devices', (done) ->
        registerDevice 0, (err) ->
            should.not.exist err
            registerDevice 1, (err) ->
                should.not.exist err
                done()

    it 'spawns two instances of cozy-desktop', (done) ->
        spawnCozyDesktop 0, (@one) =>
            spawnCozyDesktop 1, (@two) =>
                done()

    it 'makes some operations', (done) ->
        # TODO
        done()

    it 'waits that the dust settle', (done) ->
        setTimeout done, 1000
        # TODO setTimeout done, 10000

    it 'stops the two cozy-desktop instances', (done) ->
        stopCozyDesktop @one, (err) =>
            should.not.exist err
            stopCozyDesktop @two, (err) ->
                should.not.exist err
                done()

    it 'has the same files and folders', (done) ->
        # TODO
        done()

    it 'removes the two devices', (done) ->
        removeRemoteDevice 0, (err) ->
            should.not.exist err
            removeRemoteDevice 1, (err) ->
                should.not.exist err
                done()

    it 'cleans the directories', (done) ->
        #del.sync folders[0]
        #del.sync folders[1]
        done()
