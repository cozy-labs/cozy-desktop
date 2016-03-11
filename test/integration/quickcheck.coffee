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
    "test#{faker.hacker.noun()}1"
    "test#{faker.hacker.noun()}2"
]

folders = [
    path.resolve Cozy.parentDir, 'one'
    path.resolve Cozy.parentDir, 'two'
]

logs = [
    path.join Cozy.parentDir, 'one.log'
    path.join Cozy.parentDir, 'two.log'
    path.join Cozy.parentDir, 'operations.log'
]


# Register a device on cozy
registerDevice = (i, callback) ->
    app = new App folders[i]
    app.askPassword = (callback) ->
        callback null, Cozy.password
    app.addRemote Cozy.url, folders[i], deviceNames[i], (err) ->
        app.pouch.db.destroy()
        app.pouch.db = null
        callback err

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
        env.DEBUG = 'true'
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


# Generate a random operation, like creating a new file
randomOperation = ->
    data = faker.lorem.sentence()
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    op =
        create: 'file'
        path: path.join root, data.split(' ')[0]
        data: data
    return op

# Apply an operation on the file system
applyOperation = (op, callback) ->
    fs.appendFile logs[2], JSON.stringify(op, null, 2), ->
        if op.create is 'file'
            fs.writeFile op.path, op.data, callback
        else
            throw new Error "Unsupported operation: #{op}"

# Generate operations and apply them until the timeout is reached
makeOperations = (timeout, callback) ->
    op = randomOperation()
    applyOperation op, ->
        random = Math.random()
        wait = Math.floor random * random * random * 400
        remaining = timeout - wait
        if remaining > 0
            setTimeout (-> makeOperations remaining, callback), wait
        else
            callback()


# In this test, we launch 2 cozy-desktops in two directories, and make them
# synchronize via a central cozy instance. During ~20 seconds, we do some
# operations in both directory (like creating files, or moving folders).
# After that, we wait 10 seconds and we compare the 2 directories. They should
# be identical: same files and folders.
describe 'Property based testing', ->
    @slow 1000
    @timeout 60000

    before Cozy.ensurePreConditions
    before Files.deleteAll

    it 'creates the directories for both instances', (done) ->
        fs.ensureDirSync folders[0]
        fs.ensureDirSync folders[1]
        makeOperations 200, done

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
        makeOperations 2000, done

    it 'waits that the dust settle', (done) ->
        setTimeout done, 10000

    it 'stops the two cozy-desktop instances', (done) ->
        stopCozyDesktop @one, (code) =>
            code.should.equal 0
            stopCozyDesktop @two, (code) ->
                code.should.equal 0
                done()

    it 'has the same files and folders', (done) ->
        args = [
            '--recursive'
            '--exclude=.cozy-desktop'
            folders[0]
            folders[1]
        ]
        opts =
            stdio: ['ignore', process.stderr, process.stderr]
        diff = child.spawn 'diff', args, opts
        diff.on 'exit', (code) ->
            code.should.equal 0
            done()

    it 'removes the two devices', (done) ->
        removeRemoteDevice 0, (err) ->
            should.not.exist err
            removeRemoteDevice 1, (err) ->
                should.not.exist err
                done()

    it 'cleans the directories', (done) ->
        del.sync folders[0]
        del.sync folders[1]
        done()
