/* eslint-env mocha */

import clone from 'lodash.clone'
import faker from 'faker'
import find from 'lodash.find'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Push', function () {
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
  before(Cozy.push)
  after(Cozy.clean)

  let parent = {
    path: '',
    name: faker.commerce.color()
  }
  let folder = {
    path: '',
    name: faker.hacker.noun(),
    docType: 'folder'
  }
  let file = {
    path: '',
    name: `${faker.hacker.adjective()}.jpg`,
    docType: 'file'
  }

  it('pushs a local folder to the remote cozy', function (done) {
    let folderPath = path.join(this.syncPath, folder.path, folder.name)
    fs.ensureDirSync(folderPath)
    return setTimeout(() =>
      Files.getAllFolders(function (_, folders) {
        should.exist(find(folders, folder))
        done()
      })

    , 1500)
  })

  it('renames the folder', function (done) {
    let old = clone(folder)
    folder.name = faker.hacker.noun()
    let oldPath = path.join(this.syncPath, old.path, old.name)
    let newPath = path.join(this.syncPath, folder.path, folder.name)
    fs.renameSync(oldPath, newPath)
    return setTimeout(() =>
      Files.getAllFolders(function (_, folders) {
        should.not.exist(find(folders, old))
        should.exist(find(folders, folder))
        done()
      })

    , 5000)
  })

  it('moves the folder', function (done) {
    let parentPath = path.join(this.syncPath, parent.path, parent.name)
    fs.ensureDirSync(parentPath)
    let old = clone(folder)
    folder.path = `/${parent.name}`
    let oldPath = path.join(this.syncPath, old.path, old.name)
    let newPath = path.join(this.syncPath, folder.path, folder.name)
    fs.renameSync(oldPath, newPath)
    return setTimeout(() =>
      Files.getAllFolders(function (_, folders) {
        should.not.exist(find(folders, old))
        should.exist(find(folders, folder))
        done()
      })

    , 2500)
  })

  it('removes the folder', function (done) {
    let folderPath = path.join(this.syncPath, folder.path, folder.name)
    fs.rmdirSync(folderPath)
    return setTimeout(() =>
      Files.getAllFolders(function (_, folders) {
        should.not.exist(find(folders, folder))
        done()
      })

    , 3500)
  })

  it('pushs a local file to the remote cozy', function (done) {
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
    let filePath = path.join(this.syncPath, file.path, file.name)
    fs.copySync(fixturePath, filePath)
    file.size = fs.statSync(fixturePath).size
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.exist(find(files, file))
        done()
      })

    , 3000)
  })

  it('renames the file', function (done) {
    let old = clone(file)
    delete old.size
    file.name = `${faker.hacker.noun()}.jpg`
    let oldPath = path.join(this.syncPath, old.path, old.name)
    let newPath = path.join(this.syncPath, file.path, file.name)
    fs.renameSync(oldPath, newPath)
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.not.exist(find(files, old))
        should.exist(find(files, file))
        done()
      })

    , 3000)
  })

  it('moves the file', function (done) {
    let old = clone(file)
    delete old.size
    file.path = `/${parent.name}`
    let oldPath = path.join(this.syncPath, old.path, old.name)
    let newPath = path.join(this.syncPath, file.path, file.name)
    fs.renameSync(oldPath, newPath)
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.not.exist(find(files, old))
        should.exist(find(files, file))
        done()
      })

    , 3000)
  })

  it('overwrites the file', function (done) {
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
    let filePath = path.join(this.syncPath, file.path, file.name)
    fs.copySync(fixturePath, filePath)
    file.size = fs.statSync(fixturePath).size
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.exist(find(files, file))
        done()
      })

    , 3000)
  })

  it('removes the file', function (done) {
    let filePath = path.join(this.syncPath, file.path, file.name)
    fs.unlinkSync(filePath)
    return setTimeout(() =>
      Files.getAllFiles(function (_, files) {
        should.not.exist(find(files, file))
        done()
      })

    , 3500)
  })
})
