/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Cancel', function () {
  this.slow(1000)
  this.timeout(10000)

  // This integration test is unstable on travis (too often red).
  // It's disabled for the moment, but we should find a way to make it
  // more stable on travis, and enable it again.
  if (process.env.TRAVIS) {
    it('is unstable on travis')
    return
  }

  before(Cozy.ensurePreConditions)
  before(Files.deleteAll)
  before(Cozy.registerDevice)
  before(Cozy.pull)
  after(Cozy.clean)

  let waitAppear = function (localPath, callback) {
    let interval
    interval = setInterval(function () {
      if (fs.existsSync(localPath)) {
        clearInterval(interval)
        return callback()
      }
    }, 20)
  }

  let waitDisappear = function (localPath, callback) {
    let interval
    interval = setInterval(function () {
      if (!fs.existsSync(localPath)) {
        clearInterval(interval)
        return callback()
      }
    }, 20)
  }

  describe('Move a file, then moved it back', function () {
    let twoPath
    let one = {
      path: '',
      name: faker.hacker.adjective()
    }
    let two = {
      path: '',
      name: faker.hacker.noun()
    }

    let onePath = twoPath = ''

    it('sets paths', function () {
      onePath = path.join(this.syncPath, one.path, one.name)
      twoPath = path.join(this.syncPath, two.path, two.name)
    })

    it('creates a file on the local', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      return Files.uploadFile(one, fixturePath, function (_, created) {
        one.id = two.id = created.id
        return waitAppear(onePath, done)
      })
    })

    it('moves the file', done =>
      setTimeout(() =>
        Files.updateFile(two, function (err, updated) {
          should.not.exist(err)
          return waitAppear(twoPath, function () {
            fs.existsSync(onePath).should.be.false()
            done()
          })
        })
      , 800)
    )

    it('moves back the file to its original path', done =>
      setTimeout(() =>
        Files.updateFile(one, function (err, updated) {
          should.not.exist(err)
          return waitAppear(onePath, function () {
            fs.existsSync(twoPath).should.be.false()
            done()
          })
        })
      , 800)
    )
  })

  describe('Delete a file and recreate it', function () {
    let file = {
      path: '',
      name: faker.hacker.verb()
    }

    let filePath = ''
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')

    it('creates a file on the local', function (done) {
      filePath = path.join(this.syncPath, file.path, file.name)
      return Files.uploadFile(file, fixturePath, function (_, created) {
        file.id = created.id
        return waitAppear(filePath, done)
      })
    })

    it('removes the file', done =>
      setTimeout(() =>
        Files.removeFile(file, (_, removed) => waitDisappear(filePath, done))
      , 500)
    )

    it('recreates the file', done =>
      setTimeout(function () {
        delete file.id
        return Files.uploadFile(file, fixturePath, (_, created) => waitAppear(filePath, done))
      }, 500)
    )
  })
})
