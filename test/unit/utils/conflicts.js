/* @flow */
/* eslint-env mocha */

const should = require('should')
const path = require('path')

const {
  CONFLICT_REGEXP,
  generateConflictPath
} = require('../../../core/utils/conflicts')

describe('Conflicts.generateConflictPath()', () => {
  const runSharedExamples = (
    {
      base,
      ext = '',
      ancestors = '',
      conflict = ''
    } /*: { base: string, ext?: string, ancestors?: string, conflict?: string } */
  ) => {
    const filepath = ancestors + base + conflict + ext

    it('returns a path with a conflict suffix', () => {
      const conflictPath = generateConflictPath(filepath)
      should(conflictPath)
        .be.a.String()
        .and.match(CONFLICT_REGEXP)
    })

    it('returns a path within the same parent', () => {
      const conflictPath = generateConflictPath(filepath)
      should(conflictPath)
        .be.a.String()
        .and.startWith(ancestors)

      if (ancestors !== '')
        should(conflictPath).not.containEql(ancestors + ancestors)
    })

    it('returns a path with the same extension', () => {
      const conflictPath = generateConflictPath(filepath)
      should(conflictPath)
        .be.a.String()
        .and.endWith(ext)
    })

    it('returns a path with up to the first 180 characters of the original path', () => {
      const conflictPath = generateConflictPath(filepath)
      const conflictStart = path.basename(conflictPath).search(CONFLICT_REGEXP)
      should(conflictStart).be.lessThanOrEqual(180)
      should(filepath).startWith(conflictPath.slice(0, conflictStart))
    })

    it('does not modify the original path', () => {
      const originalPath = filepath
      generateConflictPath(filepath)
      should(filepath).equal(originalPath)
    })
  }

  context('with no file extension', () => {
    runSharedExamples({ base: 'docname' })
  })

  context('with complex extension `.tar.gz`', () => {
    it('should but does not keep complete extension', () => {
      // FIXME: must be docname-conflict-<ISODATE>.tar.gz instead of
      // `docname.tar-conflict-<ISODATE>.gz`.
      const conflictPath = generateConflictPath('docname.tar.gz')
      should(path.extname(conflictPath)).equal('.gz')
    })
  })

  context('with no previous conflicts', () => {
    runSharedExamples({ base: 'docname', ext: '.pdf' })
  })

  context('with previous file conflict', () => {
    runSharedExamples({
      base: 'docname',
      conflict: '-conflict-1970-01-01T13_37_00.666Z',
      ext: '.pdf'
    })

    context('with no file extension', () => {
      runSharedExamples({
        base: 'docname',
        conflict: '-conflict-1970-01-01T13_37_00.666Z'
      })
    })
  })

  context('with parents', () => {
    runSharedExamples({
      ancestors: path.normalize('parent/dir/'),
      base: 'docname',
      ext: '.pdf'
    })
  })

  context('with previous parent conflict', () => {
    const ancestors = path.normalize(
      'parent/dir-conflict-1970-01-01T13_37_00.666Z/'
    )
    const base = 'docname'
    const ext = '.pdf'

    runSharedExamples({ ancestors, base, ext })

    it('should not replace the conflict suffix of a parent', () => {
      const conflictPath = generateConflictPath(`${ancestors}${base}${ext}`)
      should(conflictPath)
        .startWith(`${ancestors}${base}-conflict-`)
        .and.endWith(ext)
    })
  })

  context('with long file name', () => {
    runSharedExamples({
      base:
        'Lorem ipsum dolor sit amet consectetur adipiscing elit Nam a velit at dolor euismod tincidunt sit amet id ante Cras vehicula lectus purus In lobortis risus lectus vitae rhoncus quam porta nullam',
      ext: '.pdf'
    })
  })
})
