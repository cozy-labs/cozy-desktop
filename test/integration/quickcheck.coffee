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
    "test#{faker.hacker.abbreviation()}1"
    "test#{faker.hacker.abbreviation()}2"
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
    pid.kill 'SIGUSR1'
    pid.on 'exit', callback
    setTimeout (-> pid.kill()), 1000


# List of directories and files that can be used when generating operations.
# To ease debugging, filenames starts with an uppercase letter and dirnames
# starts with a lowercase letter.
dirs = ['.']
files = []

# Create a random file creation operation
createFileOperation = ->
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    dir = faker.random.arrayElement dirs
    data = faker.lorem.sentence()
    file = path.join dir, data.split(' ')[0]
    files.push file
    op =
        create: 'file'
        path: path.join root, file
        data: data
    return op

# Create a random file removal operation
removeFileOperation = ->
    return createFileOperation() if files.length is 0
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    file = faker.random.arrayElement files
    op =
        remove: 'file'
        path: path.join root, file
    return op

# Create a random move file operation
moveFileOperation = ->
    return createFileOperation() if files.length is 0
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    src = faker.random.arrayElement files
    parent = path.dirname src
    dst = path.join parent, faker.name.firstName()
    files.push dst
    op =
        move: 'file'
        src: path.join root, src
        dst: path.join root, dst
    return op

# Create a random copy file operation
copyFileOperation = ->
    return createFileOperation() if files.length is 0
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    src = faker.random.arrayElement files
    parent = path.dirname src
    dst = path.join parent, faker.name.firstName()
    files.push dst
    op =
        copy: 'file'
        src: path.join root, src
        dst: path.join root, dst
    return op

# Create a random mkdir operation
mkdirOperation = ->
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    parent = faker.random.arrayElement dirs
    dir = path.join parent, faker.commerce.color()
    dirs.push dir
    op =
        create: 'dir'
        path: path.join root, dir
    return op

# Create a random rmdir operation (or mkdir if not possible)
rmdirOperation = ->
    return mkdirOperation() if dirs.length is 1
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    dir = faker.random.arrayElement dirs[1..]
    op =
        remove: 'dir'
        path: path.join root, dir
    return op

# Create a random move dir operation
moveDirOperation = ->
    return mkdirOperation() if dirs.length is 1
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    src = faker.random.arrayElement dirs[1..]
    parent = path.dirname src
    dst = path.join parent, faker.company.bs()
    dirs.push dst
    op =
        move: 'dir'
        src: path.join root, src
        dst: path.join root, dst
    return op

# Create a random copy dir operation
copyDirOperation = ->
    return mkdirOperation() if dirs.length is 1
    root = if Math.random() > 0.5 then folders[0] else folders[1]
    src = faker.random.arrayElement dirs[1..]
    parent = path.dirname src
    dst = path.join parent, faker.company.bs()
    dirs.push dst
    op =
        copy: 'dir'
        src: path.join root, src
        dst: path.join root, dst
    return op

# Generate a random operation, like creating a new file
randomOperation = ->
    r = Math.random()
    return switch
        when r < 0.20 then mkdirOperation()
        when r < 0.30 then rmdirOperation()
        when r < 0.40 then removeFileOperation()
        when r < 0.45 then moveFileOperation()
        when r < 0.50 then moveDirOperation()
        when r < 0.52 then copyFileOperation()
        when r < 0.54 then copyDirOperation()
        else createFileOperation()

# Apply an operation on the file system
applyOperation = (op, callback) ->
    fs.appendFile logs[2], JSON.stringify(op, null, 2), ->
        if op.create is 'file'
            fs.writeFile op.path, op.data, callback
        else if op.create is 'dir'
            fs.ensureDir op.path, callback
        else if op.remove
            fs.remove op.path, callback
        else if op.move
            fs.move op.src, op.dst, callback
        else if op.copy
            fs.copy op.src, op.dst, callback
        else
            throw new Error "Unsupported operation: #{op}"

# Generate operations and apply them until the timeout is reached
makeOperations = (timeout, callback) ->
    op = randomOperation()
    applyOperation op, ->
        random = Math.random()
        wait = Math.floor random * random * random * 1600
        remaining = timeout - wait
        if remaining > 0
            setTimeout (-> makeOperations remaining, callback), wait
        else
            callback()


# In this test, we launch 2 cozy-desktops in two directories, and make them
# synchronize via a central cozy instance. During ~10 seconds, we do some
# operations in both directory (like creating files, or moving folders).
# After that, we wait 20 seconds and we compare the 2 directories. They should
# be identical: same files and folders.
describe 'Property based testing', ->
    @slow 1000
    @timeout 30000

    before Cozy.ensurePreConditions
    before Files.deleteAll

    it 'creates the directories for both instances', (done) ->
        fs.ensureDirSync folders[0]
        fs.ensureDirSync folders[1]
        fs.unlink logs[2], ->
            makeOperations 2000, done

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
        makeOperations 10000, done

    it 'waits that the dust settle', (done) ->
        setTimeout done, 20000

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
