/* eslint-env mocha */

import child from 'child_process'
import clone from 'lodash.clone'
import del from 'del'
import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import App from '../../src/app'
import Cozy from '../helpers/integration'
import Files from '../helpers/files'

let deviceNames = [
  `test${faker.hacker.abbreviation()}1`,
  `test${faker.hacker.abbreviation()}2`
]

let folders = [
  path.resolve(Cozy.parentDir, 'one'),
  path.resolve(Cozy.parentDir, 'two')
]

let logs = [
  path.join(Cozy.parentDir, 'one.log'),
  path.join(Cozy.parentDir, 'two.log'),
  path.join(Cozy.parentDir, 'operations.log')
]

// Register a device on cozy
let registerDevice = function (i, callback) {
  let app = new App(folders[i])
  app.askPassphrase = callback => callback(null, Cozy.passphrase)
  return app.addRemote(Cozy.url, folders[i], deviceNames[i], function (err) {
    app.pouch.db.destroy()
    app.pouch.db = null
    return callback(err)
  })
}

// Remove a device from cozy
let removeRemoteDevice = function (i, callback) {
  let app = new App(folders[i])
  app.askPassphrase = callback => callback(null, Cozy.passphrase)
  return app.removeRemote(deviceNames[i], callback)
}

// Spawn a cozy-desktop instance
let spawnCozyDesktop = function (i, callback) {
  let log = fs.createWriteStream(logs[i])
  return log.on('open', function () {
    let bin = path.resolve('node_modules/.bin/babel-node')
    let args = ['src/bin/cli.js', 'sync']
    let env = clone(process.env)
    env.COZY_DESKTOP_DIR = folders[i]
    env.NODE_ENV = 'test'
    env.DEBUG = 'true'
    let opts = {
      cwd: folders[i],
      env,
      stdio: ['ignore', log, log]
    }
    let pid = child.spawn(bin, args, opts)
    return callback(pid)
  })
}

// Stop a cozy-desktop instance
let stopCozyDesktop = function (pid, callback) {
  pid.kill('SIGUSR1')
  pid.on('exit', callback)
  return setTimeout(() => pid.kill(), 1000)
}

// List of directories and files that can be used when generating operations.
// To ease debugging, filenames starts with an uppercase letter and dirnames
// starts with a lowercase letter.
let dirs = ['.']
let files = []

// Create a random file creation operation
let createFileOperation = function () {
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let dir = faker.random.arrayElement(dirs)
  let data = faker.lorem.sentence()
  let file = path.join(dir, data.split(' ')[0])
  files.push(file)
  let op = {
    create: 'file',
    path: path.join(root, file),
    data
  }
  return op
}

// Create a random file removal operation
let removeFileOperation = function () {
  if (files.length === 0) { return createFileOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let file = faker.random.arrayElement(files)
  let op = {
    remove: 'file',
    path: path.join(root, file)
  }
  return op
}

// Create a random move file operation
let moveFileOperation = function () {
  if (files.length === 0) { return createFileOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let src = faker.random.arrayElement(files)
  let parent = path.dirname(src)
  let dst = path.join(parent, faker.name.firstName())
  files.push(dst)
  let op = {
    move: 'file',
    src: path.join(root, src),
    dst: path.join(root, dst)
  }
  return op
}

// Create a random copy file operation
let copyFileOperation = function () {
  if (files.length === 0) { return createFileOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let src = faker.random.arrayElement(files)
  let parent = path.dirname(src)
  let dst = path.join(parent, faker.name.firstName())
  files.push(dst)
  let op = {
    copy: 'file',
    src: path.join(root, src),
    dst: path.join(root, dst)
  }
  return op
}

// Create a random mkdir operation
let mkdirOperation = function () {
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let parent = faker.random.arrayElement(dirs)
  let dir = path.join(parent, faker.commerce.color())
  dirs.push(dir)
  let op = {
    create: 'dir',
    path: path.join(root, dir)
  }
  return op
}

// Create a random rmdir operation (or mkdir if not possible)
let rmdirOperation = function () {
  if (dirs.length === 1) { return mkdirOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let dir = faker.random.arrayElement(dirs.slice(1))
  let op = {
    remove: 'dir',
    path: path.join(root, dir)
  }
  return op
}

// Create a random move dir operation
let moveDirOperation = function () {
  if (dirs.length === 1) { return mkdirOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let src = faker.random.arrayElement(dirs.slice(1))
  let parent = path.dirname(src)
  let dst = path.join(parent, faker.company.bs())
  dirs.push(dst)
  let op = {
    move: 'dir',
    src: path.join(root, src),
    dst: path.join(root, dst)
  }
  return op
}

// Create a random copy dir operation
let copyDirOperation = function () {
  if (dirs.length === 1) { return mkdirOperation() }
  let root = Math.random() > 0.5 ? folders[0] : folders[1]
  let src = faker.random.arrayElement(dirs.slice(1))
  let parent = path.dirname(src)
  let dst = path.join(parent, faker.company.bs())
  dirs.push(dst)
  let op = {
    copy: 'dir',
    src: path.join(root, src),
    dst: path.join(root, dst)
  }
  return op
}

// Generate a random operation, like creating a new file
let randomOperation = function () {
  let r = Math.random()
  return (() => {
    switch (false) {
      case r >= 0.20: return mkdirOperation()
      case r >= 0.30: return rmdirOperation()
      case r >= 0.40: return removeFileOperation()
      case r >= 0.45: return moveFileOperation()
      case r >= 0.50: return moveDirOperation()
      case r >= 0.52: return copyFileOperation()
      case r >= 0.54: return copyDirOperation()
      default: return createFileOperation()
    }
  })()
}

// Apply an operation on the file system
let applyOperation = (op, callback) =>
    fs.appendFile(logs[2], JSON.stringify(op, null, 2), function () {
      if (op.create === 'file') {
        return fs.writeFile(op.path, op.data, callback)
      } else if (op.create === 'dir') {
        return fs.ensureDir(op.path, callback)
      } else if (op.remove) {
        return fs.remove(op.path, callback)
      } else if (op.move) {
        return fs.move(op.src, op.dst, callback)
      } else if (op.copy) {
        return fs.copy(op.src, op.dst, callback)
      } else {
        throw new Error(`Unsupported operation: ${op}`)
      }
    })

// Generate operations and apply them until the timeout is reached
let makeOperations = function (timeout, callback) {
  let op = randomOperation()
  return applyOperation(op, function () {
    let random = Math.random()
    let wait = Math.floor(random * random * random * 1600)
    let remaining = timeout - wait
    if (remaining > 0) {
      return setTimeout(() => makeOperations(remaining, callback), wait)
    } else {
      return callback()
    }
  })
}

// In this test, we launch 2 cozy-desktops in two directories, and make them
// synchronize via a central cozy instance. During ~10 seconds, we do some
// operations in both directory (like creating files, or moving folders).
// After that, we wait 20 seconds and we compare the 2 directories. They should
// be identical: same files and folders.
describe('Property based testing', function () {
  this.slow(1000)
  this.timeout(30000)

  // Disable this test on travis because it's not simple as green or red.
  // It can fail for reasons other than a bug in cozy-desktop.
  // For example, it can be that the test has not waited long enough after a
  // conflict between 2 folders with many files. Cozy-desktop will manage the
  // situation but it takes several minutes for that.
  if (process.env.TRAVIS) {
    it('is unstable on travis')
    return
  }

  before(Cozy.ensurePreConditions)
  before(Files.deleteAll)

  it('creates the directories for both instances', function (done) {
    fs.ensureDirSync(folders[0])
    fs.ensureDirSync(folders[1])
    return fs.unlink(logs[2], () => makeOperations(2000, done))
  })

  it('registers two devices', done =>
    registerDevice(0, function (err) {
      should.not.exist(err)
      return registerDevice(1, function (err) {
        should.not.exist(err)
        done()
      })
    })
  )

  it('spawns two instances of cozy-desktop', function (done) {
    spawnCozyDesktop(0, one => {
      this.one = one
      return spawnCozyDesktop(1, two => {
        this.two = two
        done()
      })
    })
  })

  it('makes some operations', done => makeOperations(10000, done))

  it('waits that the dust settle', done => setTimeout(done, 20000))

  it('stops the two cozy-desktop instances', function (done) {
    return stopCozyDesktop(this.one, code => {
      code.should.equal(0)
      return stopCozyDesktop(this.two, function (code) {
        code.should.equal(0)
        done()
      })
    }
        )
  })

  it('has the same files and folders', function (done) {
    let args = [
      '--recursive',
      '--exclude=.cozy-desktop',
      folders[0],
      folders[1]
    ]
    let opts =
            {stdio: ['ignore', process.stderr, process.stderr]}
    let diff = child.spawn('diff', args, opts)
    return diff.on('exit', function (code) {
      code.should.equal(0)
      done()
    })
  })

  it('removes the two devices', done =>
    removeRemoteDevice(0, function (err) {
      should.not.exist(err)
      return removeRemoteDevice(1, function (err) {
        should.not.exist(err)
        done()
      })
    })
  )

  it('cleans the directories', function (done) {
    del.sync(folders[0])
    del.sync(folders[1])
    done()
  })
})
