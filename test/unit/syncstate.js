/* @flow */
/* eslint-env mocha */

const should = require('should')

const { makeAlert } = require('../../core/syncstate')

describe('makeAlert', () => {
  const makeErr = doc => ({
    seq: 3,
    code: 'IncompatibleDoc',
    doc
  })

  it('carries the first issue of the doc incompatibilities', () => {
    const alert = makeAlert(
      makeErr({
        _id: 'doc-id',
        docType: 'file',
        path: 'di:r/file'.replace('/', '/'),
        incompatibilities: [
          {
            type: 'reservedChars',
            name: 'di:r',
            path: 'di:r',
            platform: 'linux',
            docType: 'directory',
            reservedChars: [':']
          },
          {
            type: 'reservedName',
            name: 'CON',
            path: 'di:r/CON',
            platform: 'linux',
            docType: 'file'
          }
        ]
      })
    )

    should(alert.issue).deepEqual({
      issueType: 'reservedChars',
      name: 'di:r',
      path: 'di:r',
      platform: 'linux',
      docType: 'directory',
      chars: [':'],
      reservedName: null,
      forbiddenLastChar: null,
      maxBytes: null,
      sizeBytes: 4
    })
  })

  it('handles pathMaxBytes issues without name', () => {
    const alert = makeAlert(
      makeErr({
        _id: 'doc-id',
        docType: 'file',
        path: 'a/b/c',
        incompatibilities: [
          {
            type: 'pathMaxBytes',
            path: 'a/b/c',
            pathBytes: 4200,
            pathMaxBytes: 4095,
            platform: 'linux',
            docType: 'file'
          }
        ]
      })
    )

    should(alert.issue).deepEqual({
      issueType: 'pathMaxBytes',
      name: null,
      path: 'a/b/c',
      platform: 'linux',
      docType: 'file',
      chars: null,
      reservedName: null,
      forbiddenLastChar: null,
      maxBytes: 4095,
      sizeBytes: 4200
    })
  })

  it('computes the name size for nameMaxBytes issues', () => {
    const longName = 'a'.repeat(250)
    const alert = makeAlert(
      makeErr({
        _id: 'doc-id',
        docType: 'file',
        path: `dir/${longName}`,
        incompatibilities: [
          {
            type: 'nameMaxBytes',
            name: longName,
            path: `dir/${longName}`,
            nameMaxBytes: 243,
            platform: 'win32',
            docType: 'file'
          }
        ]
      })
    )

    should(alert.issue).deepEqual({
      issueType: 'nameMaxBytes',
      name: longName,
      path: `dir/${longName}`,
      platform: 'win32',
      docType: 'file',
      chars: null,
      reservedName: null,
      forbiddenLastChar: null,
      maxBytes: 243,
      sizeBytes: 250
    })
  })

  it('has a null issue when doc has no incompatibilities', () => {
    const alert = makeAlert(
      makeErr({ _id: 'doc-id', docType: 'file', path: 'a/file' })
    )

    should(alert.issue).be.null()
  })

  it('has a null issue when there is no doc', () => {
    const alert = makeAlert({ seq: 1, code: 'MissingPermissions' })

    should(alert.issue).be.null()
  })
})
