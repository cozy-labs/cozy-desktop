/* eslint-env mocha */

import should from 'should'

import pathRestrictions, {
  detectNameIssues, detectPathLengthIssue
} from '../../src/path_restrictions'

describe('path_restrictions', () => {
  describe('detectNameIssues', () => {
    it('lists multiple illegal characters', () => {
      const platform = 'win32'
      const reservedChars = Array.from(pathRestrictions.win.reservedChars).slice(0, 2)
      const name = `foo${reservedChars[0]}bar${reservedChars[1]}`

      should(detectNameIssues(name, platform)).deepEqual([{
        type: 'reservedChars',
        name,
        reservedChars: new Set(reservedChars),
        platform
      }])
    })

    it('is null when name is compatible', () => {
      should(detectNameIssues('foo', process.platform)).deepEqual([])
    })

    context('on Linux', () => {
      const platform = 'linux'

      it('is incompatible when name contains any of linux.reservedChars', () => {
        pathRestrictions.linux.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIssues(name, platform)).deepEqual([{
            type: 'reservedChars',
            name,
            reservedChars: new Set(char),
            platform
          }])
        })
      })

      it('is compatible when name contains others win.reservedChars', () => {
        pathRestrictions.win.reservedChars.forEach(char => {
          if (!pathRestrictions.linux.reservedChars.has(char)) {
            const name = `foo${char}bar`
            should(detectNameIssues(name, platform)).deepEqual([])
          }
        })
      })

      it('is compatible when name ends with any of win.forbiddenLastChars', () => {
        pathRestrictions.win.forbiddenLastChars.forEach(forbiddenLastChar => {
          const name = 'foo' + forbiddenLastChar
          should(detectNameIssues(name, platform)).deepEqual([])
        })
      })
    })

    context('on macOS', () => {
      const platform = 'darwin'

      it('is incompatible when name contains any of mac.reservedChars', () => {
        pathRestrictions.mac.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIssues(name, platform)).deepEqual([{
            type: 'reservedChars',
            name,
            reservedChars: new Set(char),
            platform
          }])
        })
      })

      it('is compatible when name contains others win.reservedChars', () => {
        pathRestrictions.win.reservedChars.forEach(char => {
          if (!pathRestrictions.mac.reservedChars.has(char)) {
            const name = `foo${char}bar`
            should(detectNameIssues(name, platform)).deepEqual([])
          }
        })
      })

      it('is compatible when name ends with any of win.forbiddenLastChars', () => {
        pathRestrictions.win.forbiddenLastChars.forEach(forbiddenLastChar => {
          const name = 'foo' + forbiddenLastChar
          should(detectNameIssues(name, platform)).deepEqual([])
        })
      })
    })

    context('on Windows', () => {
      const platform = 'win32'

      it('is incompatible when name contains any of win.reservedChars', () => {
        pathRestrictions.win.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIssues(name, platform)).deepEqual([{
            type: 'reservedChars',
            name,
            reservedChars: new Set(char),
            platform
          }])
        })
      })

      it('is incompatible when name is one of win.reservedNames', () => {
        pathRestrictions.win.reservedNames.forEach(reservedName => {
          const nameVariants = [
            reservedName,
            reservedName.toLowerCase(),
            `${reservedName}.txt`
          ]

          nameVariants.forEach(name => {
            should(detectNameIssues(name, platform)).deepEqual([{
              type: 'reservedName',
              name,
              reservedName,
              platform
            }])
          })
        })
      })

      it('is incompatible when name ends with any of win.forbiddenLastChars', () => {
        pathRestrictions.win.forbiddenLastChars.forEach(forbiddenLastChar => {
          const name = 'foo' + forbiddenLastChar

          should(detectNameIssues(name, platform)).deepEqual([{
            type: 'forbiddenLastChar',
            name,
            forbiddenLastChar,
            platform
          }])
        })
      })
    })
  })

  describe('detectPathLengthIssue', () => {
    const { win } = pathRestrictions

    it('detects paths with a byte size greater than pathMaxBytes', () => {
      should(detectPathLengthIssue('x'.repeat(win.pathMaxBytes + 1), 'win32'))
        .have.properties({
          pathBytes: win.pathMaxBytes + 1,
          pathMaxBytes: win.pathMaxBytes
        })
      should(detectPathLengthIssue('x'.repeat(win.pathMaxBytes), 'win32')).be.undefined()
      should(detectPathLengthIssue('', 'win32')).be.undefined()
    })

    it('computes the byte size from utf8 encoding', () => {
      should(detectPathLengthIssue('é'.repeat(win.pathMaxBytes / 2 + 1), 'win32'))
        .have.properties({
          pathBytes: win.pathMaxBytes + 1,
          pathMaxBytes: win.pathMaxBytes
        })
      should(detectPathLengthIssue('é'.repeat(win.pathMaxBytes / 2), 'win32')).be.undefined()
      should(detectPathLengthIssue('xé', 'win32')).be.undefined()
    })
  })
})
