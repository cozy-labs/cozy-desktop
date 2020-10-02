/* @flow */
/* eslint-env mocha */

const should = require('should')

const fs = require('fs')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')
const Promise = require('bluebird')

const { id } = require('../../../core/metadata')
const { defaultLogger } = require('../../../core/utils/logger')

const { ContextDir } = require('../../support/helpers/context_dir')
const TmpDir = require('../../support/helpers/TmpDir')

const { run } = require('../runner')

describe('Local watcher', function() {
  this.timeout(240000)
  this.slow(30000)

  const scenarios = glob.sync(path.join(__dirname, '*.json'))
  scenarios.forEach(scenario => {
    scenario = path.normalize(scenario)
    it(`works fine for ${path.basename(scenario)}`, async function() {
      const ops = await fse.readJson(scenario)
      if (ops.length > 0 && ops[0].op === 'pending') {
        return this.skip(ops[0].msg || 'pending')
      }

      let state /*: Object */ = { name: scenario, conflicts: [] }
      state.dir = new ContextDir(await TmpDir.emptyForTestFile(scenario))
      defaultLogger.streams.length = 0
      defaultLogger.addStream({
        type: 'file',
        path: state.dir.root + '.log',
        level: 'debug'
      })
      await run(state, ops)

      // Wait that the dust settles
      should.exists(state.watcher)
      should.exists(state.pouchdb)
      await Promise.delay(2000)
      await state.watcher.stop()

      // Pouchdb should have the same tree that the file system
      let expected = await state.dir.tree()
      expected = expected.map(item => item.replace(/\/$/, ''))
      expected = expected.map(item => path.normalize(id(item)))
      expected = expected.sort((a, b) => a.localeCompare(b))
      let actual = await state.pouchdb.tree()
      actual = actual.filter(item => !item.startsWith('_design/'))
      actual = actual.sort((a, b) => a.localeCompare(b))
      should(actual).deepEqual(expected)

      // And no conflict should have happened
      should(state.conflicts).be.empty()

      // And the references should have been kept in pouchdb
      for (const relpath of expected) {
        let referenced = false
        let stats
        const abspath = state.dir.abspath(relpath)
        if (state.winfs) {
          stats = state.winfs.lstatSync(abspath)
          referenced = state.byFileIds.has(stats.fileid)
        } else {
          stats = await fse.stat(abspath)
          referenced = (stats.mode & fs.constants.S_IWGRP) !== 0
        }
        if (referenced) {
          const doc = await state.pouchdb.byIdMaybe(id(relpath))
          should(doc.remote).be.equal(stats.ino)
        }
      }
    })
  })
})
