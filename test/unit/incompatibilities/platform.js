/* eslint-env mocha */

const should = require('should')

const platformIncompatibilities = require('../../../core/incompatibilities/platform')
const { detectNameIncompatibilities, detectPathLengthIncompatibility } =
  platformIncompatibilities

describe('core/incompatibilities/platform', () => {
  describe('detectNameIncompatibilities', () => {
    it('lists multiple illegal characters', () => {
      const platform = 'win32'
      const reservedChars = Array.from(
        platformIncompatibilities.win.reservedChars
      ).slice(0, 2)
      const name = `foo${reservedChars[0]}bar${reservedChars[1]}`

      should(detectNameIncompatibilities(name, 'file', platform)).deepEqual([
        {
          type: 'reservedChars',
          name,
          reservedChars: new Set(reservedChars),
          platform
        }
      ])
    })

    it('is null when name is compatible', () => {
      should(
        detectNameIncompatibilities('foo', 'file', process.platform)
      ).deepEqual([])
    })

    context('on Linux', () => {
      const platform = 'linux'
      const { nameMaxBytes } = platformIncompatibilities.linux

      it('is incompatible when name is longer than linux.nameMaxBytes', () => {
        const name = 'x'.repeat(nameMaxBytes + 1)

        should(detectNameIncompatibilities(name, 'file', platform)).deepEqual([
          { type: 'nameMaxBytes', name, nameMaxBytes, platform }
        ])
      })

      it('is incompatible when name contains any of linux.reservedChars', () => {
        platformIncompatibilities.linux.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIncompatibilities(name, 'file', platform)).deepEqual(
            [
              {
                type: 'reservedChars',
                name,
                reservedChars: new Set(char),
                platform
              }
            ]
          )
        })
      })

      it('is compatible when name contains others win.reservedChars', () => {
        platformIncompatibilities.win.reservedChars.forEach(char => {
          if (!platformIncompatibilities.linux.reservedChars.has(char)) {
            const name = `foo${char}bar`
            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([])
          }
        })
      })

      it('is compatible when name ends with any of win.forbiddenLastChars', () => {
        platformIncompatibilities.win.forbiddenLastChars.forEach(
          forbiddenLastChar => {
            const name = 'foo' + forbiddenLastChar
            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([])
          }
        )
      })
    })

    context('on macOS', () => {
      const platform = 'darwin'
      const { nameMaxBytes } = platformIncompatibilities.mac

      it('is incompatible when name is longer than mac.nameMaxBytes', () => {
        const name = 'x'.repeat(nameMaxBytes + 1)

        should(detectNameIncompatibilities(name, 'file', platform)).deepEqual([
          { type: 'nameMaxBytes', name, nameMaxBytes, platform }
        ])
      })

      it('is incompatible when name contains any of mac.reservedChars', () => {
        platformIncompatibilities.mac.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIncompatibilities(name, 'file', platform)).deepEqual(
            [
              {
                type: 'reservedChars',
                name,
                reservedChars: new Set(char),
                platform
              }
            ]
          )
        })
      })

      it('is compatible when name contains others win.reservedChars', () => {
        platformIncompatibilities.win.reservedChars.forEach(char => {
          if (!platformIncompatibilities.mac.reservedChars.has(char)) {
            const name = `foo${char}bar`
            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([])
          }
        })
      })

      it('is compatible when name ends with any of win.forbiddenLastChars', () => {
        platformIncompatibilities.win.forbiddenLastChars.forEach(
          forbiddenLastChar => {
            const name = 'foo' + forbiddenLastChar
            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([])
          }
        )
      })
    })

    context('on Windows', () => {
      const platform = 'win32'
      const { nameMaxBytes, dirNameMaxBytes } = platformIncompatibilities.win

      it('is incompatible when name is longer than win.nameMaxBytes', () => {
        const name = 'x'.repeat(nameMaxBytes + 1)

        should(detectNameIncompatibilities(name, 'file', platform)).deepEqual([
          { type: 'nameMaxBytes', name, nameMaxBytes, platform }
        ])
      })

      it('is incompatible when dir name is longer than win.dirNameMaxBytes', () => {
        const name = 'x'.repeat(dirNameMaxBytes + 1)

        should(detectNameIncompatibilities(name, 'folder', platform)).deepEqual(
          [{ type: 'dirNameMaxBytes', name, dirNameMaxBytes, platform }]
        )
      })

      it('is incompatible when name contains any of win.reservedChars', () => {
        platformIncompatibilities.win.reservedChars.forEach(char => {
          const name = `foo${char}bar`

          should(detectNameIncompatibilities(name, 'file', platform)).deepEqual(
            [
              {
                type: 'reservedChars',
                name,
                reservedChars: new Set(char),
                platform
              }
            ]
          )
        })
      })

      it('is incompatible when name is one of win.reservedNames', () => {
        platformIncompatibilities.win.reservedNames.forEach(reservedName => {
          const nameVariants = [
            reservedName,
            reservedName.toLowerCase(),
            `${reservedName}.txt`
          ]

          nameVariants.forEach(name => {
            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([
              {
                type: 'reservedName',
                name,
                reservedName,
                platform
              }
            ])
          })
        })
      })

      it('is incompatible when name ends with any of win.forbiddenLastChars', () => {
        platformIncompatibilities.win.forbiddenLastChars.forEach(
          forbiddenLastChar => {
            const name = 'foo' + forbiddenLastChar

            should(
              detectNameIncompatibilities(name, 'file', platform)
            ).deepEqual([
              {
                type: 'forbiddenLastChar',
                name,
                forbiddenLastChar,
                platform
              }
            ])
          }
        )
      })
    })
  })

  describe('detectPathLengthIncompatibility', () => {
    const { win } = platformIncompatibilities

    it('detects paths with a byte size greater than pathMaxBytes', () => {
      should(
        detectPathLengthIncompatibility(
          'x'.repeat(win.pathMaxBytes + 1),
          'win32'
        )
      ).have.properties({
        pathBytes: win.pathMaxBytes + 1,
        pathMaxBytes: win.pathMaxBytes
      })
      should(
        detectPathLengthIncompatibility('x'.repeat(win.pathMaxBytes), 'win32')
      ).be.undefined()
      should(detectPathLengthIncompatibility('', 'win32')).be.undefined()
    })

    it('computes the byte size from utf8 encoding', () => {
      should(Buffer.byteLength('é')).eql(2)
      should(
        detectPathLengthIncompatibility('é'.repeat(win.pathMaxBytes), 'win32')
      ).have.properties({
        pathBytes: 2 * win.pathMaxBytes,
        pathMaxBytes: win.pathMaxBytes
      })
      should(
        detectPathLengthIncompatibility(
          'é'.repeat(win.pathMaxBytes / 2),
          'win32'
        )
      ).be.undefined()
      should(detectPathLengthIncompatibility('xé', 'win32')).be.undefined()
    })
  })
})
