/* @flow */
/* eslint-env mocha */

const sysMime = require('mime')
const should = require('should')

const mime = require('../../../core/utils/mime')

const { NOTE_MIME_TYPE } = require('../../../core/remote/constants')

describe('utils/mime', () => {
  it('detects the Cozy Notes mime type', () => {
    should(mime.lookup('My Note.cozy-note')).eql(NOTE_MIME_TYPE)
  })

  it('returns the same type as the sytem mime for other docs', () => {
    const filePaths = ['DS100.jpg', 'Report.md', 'stats.xls']
    const mimes = filePaths.map(filePath => mime.lookup(filePath))
    const sysMimes = filePaths.map(filePath => sysMime.getType(filePath))
    should(mimes).eql(sysMimes)
  })
})
