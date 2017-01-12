/* eslint-env mocha */

import faker from 'faker'
import find from 'lodash.find'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Swap 2 files', function () {
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
  before(Cozy.sync)
  after(Cozy.clean)

  let one = {
    path: '',
    name: faker.hacker.adjective(),
    docType: 'file'
  }
  let two = {
    path: '',
    name: faker.hacker.noun(),
    docType: 'file'
  }
  let tmp = {
    path: '',
    name: 'tmp-for-swap',
    docType: 'file'
  }

  it('pushs a local file to the remote cozy', function (done) {
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
    let onePath = path.join(this.syncPath, one.path, one.name)
    fs.copySync(fixturePath, onePath)
    one.size = fs.statSync(fixturePath).size
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        let found = find(files, one)
        should.exist(found)
        one.checksum = found.checksum
        done()
      })

    , 2500)
  })

  it('pushs another local file to the remote cozy', function (done) {
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
    let twoPath = path.join(this.syncPath, two.path, two.name)
    fs.copySync(fixturePath, twoPath)
    two.size = fs.statSync(fixturePath).size
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        let found = find(files, two)
        should.exist(found)
        two.checksum = found.checksum
        done()
      })

    , 2500)
  })

  it('swaps the two file', function (done) {
    let onePath = path.join(this.syncPath, one.path, one.name)
    let twoPath = path.join(this.syncPath, two.path, two.name)
    let tmpPath = path.join(this.syncPath, tmp.path, tmp.name)
    fs.renameSync(onePath, tmpPath)
    fs.renameSync(twoPath, onePath)
    fs.renameSync(tmpPath, twoPath);
    [one.size, two.size] = [two.size, one.size];
    [one.checksum, two.checksum] = [two.checksum, one.checksum]
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.exist(find(files, one))
        should.exist(find(files, two))
        should.not.exist(find(files, tmp))
        done()
      })

    , 3000)
  })
})
