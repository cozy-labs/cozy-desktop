/* eslint-env mocha */

const should = require('should')

const { popoverBounds } = require('../../../gui/js/tray.window')

describe('tray.window', () => {
  describe('popoverBounds', () => {
    const wantedWidth = 330
    const wantedHeight = 830

    context('on Windows', () => {
      context('with a single screen', () => {
        context('with bottom bar', () => {
          const workArea = { x: 0, y: 0, width: 1440, height: 870 }
          const display = { x: 0, y: 0, width: 1440, height: 900 }

          it('sticks to the bottom right', () => {
            const trayposition = { x: 1156, y: 870, width: 24, height: 30 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 783,
              x: 1110, // right
              y: 87 // bottom
            })
          })

          it('does so even when trayposition is undefined', () => {
            const trayposition = undefined
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 783,
              x: 1110, // right
              y: 87 // bottom
            })
          })

          it.skip('does the same with auto-hiding bar', () => {
            const trayposition = { x: 1156, y: 870, width: 24, height: 30 }
            const hiddenWorkArea = display
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                hiddenWorkArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 783,
              x: 1110, // right
              y: 87 // bottom
            })
          })
        })

        context('with top bar', () => {
          const workArea = { x: 0, y: 30, width: 1440, height: 870 }
          const display = { x: 0, y: 0, width: 1440, height: 900 }

          it('sticks to the top right', () => {
            const trayposition = { x: 1156, y: 0, width: 24, height: 30 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 783,
              x: 1110, // right
              y: 30 // top
            })
          })

          it('does so even when trayposition is undefined', () => {
            const trayposition = undefined
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 783,
              x: 1110, // right
              y: 30 // top
            })
          })
        })

        context('with left bar', () => {
          const workArea = { x: 62, y: 0, width: 1378, height: 900 }
          const display = { x: 0, y: 0, width: 1440, height: 900 }

          it('sticks to the bottom left', () => {
            const trayposition = { x: 9, y: 702, width: 24, height: 24 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 810,
              x: 62, // left
              y: 90 // bottom
            })
          })

          it('does so even when trayposition is undefined', () => {
            const trayposition = undefined
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 810,
              x: 62, // left
              y: 90 // bottom
            })
          })
        })

        context('with right bar', () => {
          const workArea = { x: 0, y: 0, width: 1378, height: 900 }
          const display = { x: 0, y: 0, width: 1440, height: 900 }

          it('sticks to the bottom right', () => {
            const trayposition = { x: 1383, y: 702, width: 24, height: 24 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 810,
              x: 1048, // right
              y: 90 // bottom
            })
          })

          it('does so even when trayposition is undefined', () => {
            const trayposition = undefined
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: wantedWidth,
              height: 810,
              x: 1048, // right
              y: 90 // bottom
            })
          })
        })
      })

      context(
        'with right vertical primary screen and left horizontal secondary one',
        () => {
          it('sticks to the bottom right of the primary screen near the bottom bar', () => {
            const workArea = { x: 0, y: 0, width: 1080, height: 1890 }
            const display = { x: 0, y: 0, width: 1080, height: 1920 }
            const trayposition = { x: 820, y: 1890, width: 24, height: 30 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: 330,
              height: 830,
              x: 750,
              y: 1060
            })
          })
        }
      )

      context(
        'with left horizontal primary screen and right vertical secondary one',
        () => {
          it('sticks to the bottom right of the primary screen near the bottom bar', () => {
            const workArea = { x: 0, y: 0, width: 1440, height: 870 }
            const display = { x: 0, y: 0, width: 1440, height: 900 }
            const trayposition = { x: 1180, y: 870, width: 24, height: 30 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'win32'
              )
            ).deepEqual({
              width: 330,
              height: 783,
              x: 1110,
              y: 87
            })
          })
        }
      )
    })

    context('on macOS', () => {
      context('with a single screen', () => {
        const workArea = { x: 0, y: 23, width: 1436, height: 877 }
        const display = { x: 0, y: 0, width: 1440, height: 900 }

        it('sticks to the top right', () => {
          const trayposition = { x: 938, y: 0, width: 22, height: 22 }
          should(
            popoverBounds(
              wantedWidth,
              wantedHeight,
              trayposition,
              workArea,
              display,
              'darwin'
            )
          ).deepEqual({
            width: wantedWidth,
            height: 789,
            x: 784, // right
            y: 23 // top
          })
        })

        it('sticks to the top right of the work area when trayposition is undefined', () => {
          const trayposition = undefined
          should(
            popoverBounds(
              wantedWidth,
              wantedHeight,
              trayposition,
              workArea,
              display,
              'darwin'
            )
          ).deepEqual({
            width: wantedWidth,
            height: 789,
            x: 1106, // full right
            y: 23 // top
          })
        })
      })

      context(
        'with right vertical primary screen and left horizontal secondary one',
        () => {
          it('sticks to the top right of the primary screen', () => {
            const workArea = { x: 0, y: 23, width: 1076, height: 1897 }
            const display = { x: 0, y: 0, width: 1080, height: 1920 }
            const trayposition = { x: 688, y: 0, width: 22, height: 22 }
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'darwin'
              )
            ).deepEqual({
              width: 330,
              height: 830,
              x: 534,
              y: 23
            })
          })
        }
      )

      context(
        'with left horizontal primary screen and right vertical secondary one',
        () => {
          it('sticks to the top right of the primary screen', () => {
            const workArea = { x: 0, y: 23, width: 1440, height: 877 }
            const display = { x: 0, y: 0, width: 1440, height: 900 }
            const trayposition = { x: 1049, y: 0, width: 22, height: 22 }

            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'darwin'
              )
            ).deepEqual({
              width: 330,
              height: 789,
              x: 895,
              y: 23
            })
          })
        }
      )
    })

    context('on GNU/Linux', () => {
      context('on GNOME 3', () => {
        const trayposition = { x: 0, y: 0, width: 0, height: 0 }
        const display = { x: 0, y: 0, width: 2560, height: 1440 }

        context('with X.org', () => {
          const workArea = { x: 0, y: 27, width: 2560, height: 1413 }

          it('sticks to the top right', () => {
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'linux'
              )
            ).deepEqual({
              width: wantedWidth,
              height: wantedHeight,
              x: 2230, // right
              y: 27 // top
            })
          })
        })

        context('with Wayland', () => {
          const workArea = display

          it('sticks to the top right', () => {
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'linux'
              )
            ).deepEqual({
              width: wantedWidth,
              height: wantedHeight,
              x: 2230, // right
              y: 0 // top, doesn't overlap the top bar, even when 0...
            })
          })
        })

        context('with Classic mode', () => {
          const workArea = { x: 0, y: 28, width: 2560, height: 1378 }

          it('sticks to the top right', () => {
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'linux'
              )
            ).deepEqual({
              width: wantedWidth,
              height: wantedHeight,
              x: 2230, // right
              y: 28 // top
            })
          })
        })

        context('with multiple screens', () => {
          const display = { x: 707, y: 0, width: 1920, height: 1080 }
          const workArea = { x: 707, y: 27, width: 1920, height: 1052 }
          it('sticks to the top right', () => {
            should(
              popoverBounds(
                wantedWidth,
                wantedHeight,
                trayposition,
                workArea,
                display,
                'linux'
              )
            ).deepEqual({
              width: wantedWidth,
              height: wantedHeight,
              x: 2297, // right
              y: 27 // top
            })
          })
        })
      })

      // TODO: Unity (e.g. Ubuntu LTS)
      // TODO: KDE
    })
  })
})
