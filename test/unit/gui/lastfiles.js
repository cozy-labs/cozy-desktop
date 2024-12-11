/* @flow */
/* eslint-env mocha */

const path = require('path')

const should = require('should')

const lastfiles = require('../../../gui/js/lastfiles')

const buildFile = fpath => ({
  filename: path.basename(fpath),
  path: fpath,
  icon: 'file',
  size: 0,
  updated: +new Date()
})

describe('gui/js/lastfiles', () => {
  beforeEach('clean lastfiles list', lastfiles.reset)

  describe('add', () => {
    it('adds the file to the list', async () => {
      const file = buildFile('Administrative/Taxes/January.pdf')
      await lastfiles.add(file)
      await should(lastfiles.list()).be.fulfilledWith([file])
    })

    it('keeps only 250 files in the list', async () => {
      let files = []
      for (let n = 0; n < 250; n++) {
        const file = buildFile(`Administrative/Taxes/January-${n}.pdf`)
        files.push(file)
        await lastfiles.add(file)
      }

      const file = buildFile(`Administrative/Taxes/January-250.pdf`)
      await lastfiles.add(file)
      await should(lastfiles.list()).be.fulfilledWith(
        files.slice(1).concat(file)
      )
    })

    it('removes files with the same path from the lsit', async () => {
      const file = buildFile(`Administrative/Taxes/January.pdf`)
      await lastfiles.add(file)

      await lastfiles.add(file)
      await should(lastfiles.list()).be.fulfilledWith([file])
    })
  })

  describe('remove', () => {
    it('removes all files with file path from the list', async () => {
      let files = []
      for (let n = 0; n < 250; n++) {
        const file = buildFile(`Administrative/Taxes/January-${n}.pdf`)
        files.push(file)
        await lastfiles.add(file)
      }

      const file = buildFile(`Administrative/Taxes/January-139.pdf`)
      await lastfiles.remove(file)
      await should(lastfiles.list()).be.fulfilledWith(
        files.slice(0, 139).concat(files.slice(140))
      )
    })
  })
})
