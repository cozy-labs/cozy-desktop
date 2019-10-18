/* @flow */
/* eslint-env mocha */

const fse = require('fs-extra')
const path = require('path')
const should = require('should')

const MacOSRelease = require('../support/helpers/MacOSRelease')

should.Assertion.add('hex', function(expectedPretty) {
  const expected = expectedPretty.trim().split(/\s+/)
  const actual = Buffer.from(this.obj)
    .toString('hex')
    .match(/.{1,2}/g)
  this.params = { operator: `to be represented as: ${expected.join(' ')}` }
  should(actual).deepEqual(expected)
})

describe('Case and encoding basics', () => {
  // Test helpers
  const tmpdir = path.resolve(`tmp/test/unit/case_and_encoding`)
  const abspath = relpath => path.join(tmpdir, relpath)
  const createFile = filename => fse.ensureFile(abspath(filename))
  const rename = (src, dst) => fse.rename(abspath(src), abspath(dst))
  const listFiles = () => fse.readdir(tmpdir)

  beforeEach(() => fse.emptyDir(tmpdir))

  it('Node.js strings', () => {
    should('e').have.hex('            65       ')
    should('é').have.hex('               c3 a9 ')
    should('\u00e9').have.hex('          c3 a9 ')
    should('é').have.hex('            65 cc 81 ')
    should('\u0065\u0301').have.hex(' 65 cc 81 ')
  })

  it('create file NFC', async () => {
    await createFile('\u00e9')
    switch (process.platform) {
      case 'linux':
      case 'win32':
        should(await listFiles()).deepEqual(['\u00e9'])
        break
      case 'darwin':
        if (MacOSRelease.isAtLeast(MacOSRelease.HIGH_SIERRA_10_13)) {
          should(await listFiles()).deepEqual(['\u00e9'])
        } else {
          should(await listFiles()).deepEqual(['\u0065\u0301'])
        }
        break
    }
  })

  it('create file NFD', async () => {
    await createFile('\u0065\u0301')
    switch (process.platform) {
      case 'linux':
      case 'darwin':
      case 'win32':
        should(await listFiles()).deepEqual(['\u0065\u0301'])
        break
    }
  })

  it('upcase file', async () => {
    await createFile('foo')
    should(await listFiles()).deepEqual(['foo'])
    await rename('foo', 'FOO')
    switch (process.platform) {
      case 'linux':
      case 'darwin':
      case 'win32':
        should(await listFiles()).deepEqual(['FOO'])
        break
    }
  })

  it('path.join', async () => {
    switch (process.platform) {
      case 'linux':
      case 'darwin':
        should(path.join('a', '\u00e9')).equal('a/\u00e9')
        should(path.join('a', '\u0065\u0301')).equal('a/\u0065\u0301')
        break
      case 'win32':
        should(path.join('a', '\u00e9')).equal('a\\\u00e9')
        should(path.join('a', '\u0065\u0301')).equal('a\\\u0065\u0301')
        break
    }
  })

  it('rename identical', async () => {
    await createFile('foo')
    await should(rename('foo', 'foo')).not.be.rejected()
  })

  it('rename file NFD -> NFC', async () => {
    await createFile('\u0065\u0301')
    await rename('\u0065\u0301', '\u00e9')
    switch (process.platform) {
      case 'linux':
      case 'win32':
        should(await listFiles()).deepEqual(['\u00e9'])
        break
      case 'darwin':
        if (MacOSRelease.isAtLeast(MacOSRelease.HIGH_SIERRA_10_13)) {
          should(await listFiles()).deepEqual(['\u00e9'])
        } else {
          should(await listFiles()).deepEqual(['\u0065\u0301'])
        }
        break
    }
  })

  it('rename file NFC -> NFD', async () => {
    await createFile('\u00e9')
    await rename('\u00e9', '\u0065\u0301')
    switch (process.platform) {
      case 'linux':
      case 'win32':
      case 'darwin':
        should(await listFiles()).deepEqual(['\u0065\u0301'])
        break
    }
  })
})
