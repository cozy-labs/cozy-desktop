/* eslint-env mocha */
/* @flow */

const should = require('should')

const { ContextDir } = require('../support/helpers/context_dir')
const macOSRelease = require('../support/helpers/MacOSRelease')
const {
  onMacOSAtLeast,
  onMacOSAtMost,
  onPlatforms
} = require('../support/helpers/platform')
const TmpDir = require('../support/helpers/TmpDir')

describe('File systems', () => {
  let dir

  beforeEach(async () => {
    dir = new ContextDir(await TmpDir.emptyForTestFile(__filename))
  })

  describe('creating two files with the same name but different unicode representations', () => {
    // See: https://en.wikipedia.org/wiki/Unicode_equivalence#Normalization

    const nfcFile = '\u00e9'
    const nfdFile = 'e\u0301'

    const nfcContent = `content ${nfcFile}`
    const nfdContent = `content ${nfdFile}`

    onPlatforms('win32', 'linux', () => {
      describe('assuming NTFS / EXT4', () => {
        it('allows the two files to coexist', async () => {
          await dir.outputFile(nfcFile, nfcContent)
          await dir.outputFile(nfdFile, nfdContent)

          should(await dir.tree()).deepEqual([
            nfdFile,
            nfcFile
          ])
          await should(dir).have.fileContents({
            [nfcFile]: nfcContent,
            [nfdFile]: nfdContent
          })
        })
      })
    })

    onMacOSAtLeast(macOSRelease.HIGH_SIERRA_10_13, () => {
      describe('assuming APFS', () => {
        it('keeps the NFC file when first created and writes the NFD content into it', async () => {
          await dir.outputFile(nfcFile, nfcContent)
          await dir.outputFile(nfdFile, nfdContent)

          should(await dir.tree()).deepEqual([
            nfcFile
          ])
          await should(dir).have.fileContents({
            [nfcFile]: nfdContent
          })
        })

        it('keeps the NFD file when first created and writes the NFC content into it', async () => {
          await dir.outputFile(nfdFile, nfdContent)
          await dir.outputFile(nfcFile, nfcContent)

          should(await dir.tree()).deepEqual([
            nfdFile
          ])
          await should(dir).have.fileContents({
            [nfdFile]: nfcContent
          })
        })
      })
    })

    onMacOSAtMost(macOSRelease.SIERRA_10_12, () => {
      describe('assuming HFS+', () => {
        it('normalizes the NFC filename to NFD and writes the second NFD file content into it', async () => {
          await dir.outputFile(nfcFile, nfcContent)
          await dir.outputFile(nfdFile, nfdContent)

          should(await dir.tree()).deepEqual([
            nfdFile
          ])
          await should(dir).have.fileContents({
            [nfdFile]: nfdContent
          })
        })

        it('keeps the first NFD filename and writes the second NFC file content into it', async () => {
          await dir.outputFile(nfdFile, nfdContent)
          await dir.outputFile(nfcFile, nfcContent)

          should(await dir.tree()).deepEqual([
            nfdFile
          ])
          await should(dir).have.fileContents({
            [nfdFile]: nfcContent
          })
        })
      })
    })
  })
})
