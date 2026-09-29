/* @flow */
/* eslint-env mocha */

const should = require('should')

const { SyncState, makeAlert } = require('../../core/syncstate')

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

describe('userAlerts registry', () => {
  const buildSyncState = () => new SyncState()

  const alertErr = (code, doc, seq) => ({ seq, code, doc })
  const alertDoc = (path, id = 'doc-id') => ({
    _id: id,
    docType: 'file',
    path
  })

  it('keeps a single alert when the doc is renamed while errored', () => {
    const syncState = buildSyncState()

    syncState.emit(
      'user-alert',
      alertErr('IncompatibleDoc', alertDoc('a.docx')),
      12,
      'local'
    )
    syncState.emit(
      'user-alert',
      alertErr('IncompatibleDoc', alertDoc('b.docx')),
      13,
      'local'
    )

    should(syncState.state.userAlerts.length).equal(1)
    const [alert] = syncState.state.userAlerts
    should(alert.doc && alert.doc.path).equal('b.docx')
  })

  it('removes the alert by doc id even if the path changed', () => {
    const syncState = buildSyncState()

    syncState.emit(
      'user-alert',
      alertErr('IncompatibleDoc', alertDoc('a.docx')),
      12,
      'local'
    )
    syncState.emit(
      'user-action-done',
      alertErr('IncompatibleDoc', alertDoc('b.docx')),
      13
    )

    should(syncState.state.userAlerts).be.empty()
  })

  it('replaces the alert when a new error arrives on the same doc', () => {
    const syncState = buildSyncState()

    syncState.emit(
      'user-alert',
      alertErr('IncompatibleDoc', alertDoc('a.docx')),
      12,
      'local'
    )
    syncState.emit(
      'user-alert',
      alertErr('MissingPermissions', alertDoc('b.docx')),
      13,
      'local'
    )

    should(syncState.state.userAlerts.length).equal(1)
    should(syncState.state.userAlerts[0].code).equal('MissingPermissions')
    const [alert] = syncState.state.userAlerts
    should(alert.doc && alert.doc.path).equal('b.docx')
  })

  it('matches alerts without doc by seq', () => {
    const syncState = buildSyncState()

    syncState.emit('user-alert', alertErr('UnreachableCozy'), 5, null)
    syncState.emit('user-alert', alertErr('UnreachableCozy'), 5, null)

    should(syncState.state.userAlerts.length).equal(1)

    syncState.emit('user-action-done', alertErr('UnreachableCozy'), 5)

    should(syncState.state.userAlerts).be.empty()
  })
})
