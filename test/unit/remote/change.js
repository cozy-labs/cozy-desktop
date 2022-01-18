/* eslint-env mocha */

const path = require('path')
const should = require('should')

const remoteChange = require('../../../core/remote/change')
const { onPlatforms } = require('../../support/helpers/platform')
const Builders = require('../../support/builders')

const builders = new Builders()

describe('sorter()', () => {
  describe('with identical additions', () => {
    const expected = [
      {
        doc: { path: path.normalize('FOO') },
        type: 'DirAddition'
      },
      {
        doc: { path: path.normalize('FOO/subdir') },
        type: 'DirAddition'
      },
      {
        doc: { path: path.normalize('FOO/subdir/file') },
        type: 'FileAddition'
      },
      {
        doc: { path: path.normalize('foo') },
        type: 'DirAddition'
      }
    ]

    it('sorts FOO before foo', () => {
      const changes = [
        {
          doc: { path: path.normalize('FOO/subdir') },
          type: 'DirAddition'
        },
        {
          doc: { path: path.normalize('foo') },
          type: 'DirAddition'
        },
        {
          doc: { path: path.normalize('FOO/subdir/file') },
          type: 'FileAddition'
        },
        {
          doc: { path: path.normalize('FOO') },
          type: 'DirAddition'
        }
      ]

      remoteChange.sort(changes)
      should(changes).deepEqual(expected)
    })
  })

  describe('with replacing move', () => {
    it('sorts move of replaced before move of replacing', () => {
      const moveReplacing = {
        type: 'DirMove',
        doc: { path: path.normalize('dirA') },
        was: { path: path.normalize('dirB') }
      }
      const moveReplaced = {
        type: 'DirMove',
        doc: { path: path.normalize('dirC') },
        was: { path: path.normalize('dirA') }
      }

      should(remoteChange.sort([moveReplacing, moveReplaced])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
      should(remoteChange.sort([moveReplaced, moveReplacing])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
    })

    it('sorts move of replaced before child move of replacing', () => {
      const moveReplacing = {
        type: 'DescendantChange',
        doc: { path: path.normalize('dirA/dir/subdir/empty-subsubdir') },
        was: { path: path.normalize('dirB/dir/subdir/empty-subsubdir') }
      }
      const moveReplaced = {
        type: 'DirMove',
        doc: { path: path.normalize('dirC') },
        was: { path: path.normalize('dirA') }
      }

      should(remoteChange.sort([moveReplacing, moveReplaced])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
      should(remoteChange.sort([moveReplaced, moveReplacing])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
    })

    it('sorts child move of replaced before move of replacing', () => {
      const moveReplacing = {
        type: 'DirMove',
        doc: { path: path.normalize('dirA') },
        was: { path: path.normalize('dirB') }
      }
      const moveReplaced = {
        type: 'DescendantChange',
        doc: { path: path.normalize('dirC/dir/empty-subdir-a') },
        was: { path: path.normalize('dirA/dir/empty-subdir-a') }
      }

      should(remoteChange.sort([moveReplacing, moveReplaced])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
      should(remoteChange.sort([moveReplaced, moveReplacing])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
    })

    it('sorts child move of replaced and child move of replacing by deleted path', () => {
      const moveReplacing = {
        type: 'DescendantChange',
        doc: { path: path.normalize('dirA/dir/subdir') },
        was: { path: path.normalize('dirB/dir/subdir') }
      }
      const moveReplaced = {
        type: 'DescendantChange',
        doc: { path: path.normalize('dirC/dir/empty-subdir') },
        was: { path: path.normalize('dirA/dir/empty-subdir') }
      }

      should(remoteChange.sort([moveReplacing, moveReplaced])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
      should(remoteChange.sort([moveReplaced, moveReplacing])).deepEqual([
        moveReplaced,
        moveReplacing
      ])
    })
  })

  onPlatforms(['darwin', 'win32'], () => {
    describe('with addition of trashed identical id', () => {
      it('sorts tashing before addition when addition has greater path', () => {
        const trashing = {
          type: 'DirTrashing',
          doc: { path: path.normalize('.cozy_trash/DIR') },
          was: { path: path.normalize('dst/DIR') }
        }
        const addition = {
          type: 'DirAddition',
          doc: { path: path.normalize('dst/dir') }
        }
        should(remoteChange.sort([trashing, addition])).deepEqual([
          trashing,
          addition
        ])
        should(remoteChange.sort([addition, trashing])).deepEqual([
          trashing,
          addition
        ])
      })

      it('sorts tashing before addition when addition has lower path', () => {
        const trashing = {
          type: 'DirTrashing',
          doc: { path: path.normalize('.cozy_trash/dir') },
          was: { path: path.normalize('dst/dir') }
        }
        const addition = {
          type: 'DirAddition',
          doc: { path: path.normalize('dst/DIR') }
        }
        should(remoteChange.sort([trashing, addition])).deepEqual([
          trashing,
          addition
        ])
        should(remoteChange.sort([addition, trashing])).deepEqual([
          trashing,
          addition
        ])
      })
    })

    describe('with move to trashed identical id', () => {
      it('sorts tashing before move when moved change has greater path', () => {
        const trashing = {
          type: 'DirTrashing',
          doc: { path: path.normalize('.cozy_trash/DIR') },
          was: { path: path.normalize('dst/DIR') }
        }
        const move = {
          type: 'DirMove',
          doc: { path: path.normalize('dst/dir') },
          was: { path: path.normalize('src/dir') }
        }
        should(remoteChange.sort([trashing, move])).deepEqual([trashing, move])
        should(remoteChange.sort([move, trashing])).deepEqual([trashing, move])
      })

      it('sorts tashing before move when moved change has lower path', () => {
        const trashing = {
          type: 'DirTrashing',
          doc: { path: path.normalize('.cozy_trash/dir') },
          was: { path: path.normalize('dst/dir') }
        }
        const move = {
          type: 'DirMove',
          doc: { path: path.normalize('dst/DIR') },
          was: { path: path.normalize('src/DIR') }
        }
        should(remoteChange.sort([trashing, move])).deepEqual([trashing, move])
        should(remoteChange.sort([move, trashing])).deepEqual([trashing, move])
      })
    })
  })

  describe('with move inside move', () => {
    const expected = [
      {
        doc: { path: path.normalize('parent/dst/dir') },
        type: 'DirMove',
        was: { path: path.normalize('parent/src/dir') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
        type: 'FileMove',
        was: { path: path.normalize('parent/dst/dir/subdir/file') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
        type: 'FileMove',
        was: { path: path.normalize('parent/dst/dir/subdir/file2') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
        type: 'DescendantChange',
        was: { path: path.normalize('parent/src/dir/empty-subdir') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir') },
        type: 'DescendantChange',
        was: { path: path.normalize('parent/src/dir/subdir') }
      }
    ]

    it('sorts moves before descendant moves', () => {
      const order1 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        }
      ]
      remoteChange.sort(order1)
      should(order1).deepEqual(expected)

      const order2 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        }
      ]
      remoteChange.sort(order2)
      should(order2).deepEqual(expected)

      const order3 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        }
      ]
      remoteChange.sort(order3)
      should(order3).deepEqual(expected)
    })
  })

  describe('sorts deleted before created for the same path', () => {
    const deleted = {
      doc: { path: path.normalize('parent/file') },
      type: 'FileDeletion'
    }

    const created = {
      doc: { path: path.normalize('parent/file') },
      type: 'FileAddition'
    }

    it('when deleted comes before created', () => {
      const changes = [deleted, created]
      remoteChange.sort(changes)
      should(changes).deepEqual([deleted, created])
    })

    it('when created comes before deleted', () => {
      const changes = [created, deleted]
      remoteChange.sort(changes)
      should(changes).deepEqual([deleted, created])
    })

    it('when there are other changes', () => {
      const deletedPath = path.normalize('.cozy_trash/fichier.pptx')
      const createdPath = path.normalize('1_Dossier/fichier.pptx')

      const changes = [
        {
          type: 'DirAddition',
          doc: builders
            .metadir()
            .path('2_Dossier/2_SousDossier/SousSousDossier')
            .build()
        },
        {
          type: 'FileAddition',
          doc: builders
            .metafile()
            .path('2_Dossier/1_SousDossier/fichier.xml')
            .build()
        },
        {
          type: 'FileTrashing',
          doc: builders.metafile().path(deletedPath).build(),
          was: builders.metafile().path(createdPath).build()
        },
        {
          type: 'FileAddition',
          doc: builders.metafile().path(createdPath).build()
        }
      ]

      const sortedChanges = remoteChange.sort(changes)
      const deleteIndex = sortedChanges.findIndex(
        c => c.doc.path === deletedPath
      )
      const createIndex = sortedChanges.findIndex(
        c => c.doc.path === createdPath
      )
      should(deleteIndex).be.lessThan(createIndex)
    })

    context('with replacing move', () => {
      it('sorts replacing move after move of replaced', () => {
        const changes = [
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/empty-subdir-a') },
            was: { path: path.normalize('dirA/dir/empty-subdir-a') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/subdir') },
            was: { path: path.normalize('dirA/dir/subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/empty-subdir') },
            was: { path: path.normalize('dirA/dir/empty-subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/subdir/empty-subsubdir') },
            was: { path: path.normalize('dirA/dir/subdir/empty-subsubdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir') },
            was: { path: path.normalize('dirA/dir') }
          },
          {
            type: 'DirMove',
            doc: { path: path.normalize('dirC') },
            was: { path: path.normalize('dirA') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/subdir/empty-subsubdir') },
            was: { path: path.normalize('dirB/dir/subdir/empty-subsubdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir') },
            was: { path: path.normalize('dirB/dir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/empty-subdir') },
            was: { path: path.normalize('dirB/dir/empty-subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/empty-subdir-b') },
            was: { path: path.normalize('dirB/dir/empty-subdir-b') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/subdir') },
            was: { path: path.normalize('dirB/dir/subdir') }
          },
          {
            type: 'DirMove',
            doc: { path: path.normalize('dirA') },
            was: { path: path.normalize('dirB') }
          }
        ]

        should(remoteChange.sort(changes)).deepEqual([
          {
            type: 'DirMove',
            doc: { path: path.normalize('dirC') },
            was: { path: path.normalize('dirA') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir') },
            was: { path: path.normalize('dirA/dir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/empty-subdir') },
            was: { path: path.normalize('dirA/dir/empty-subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/empty-subdir-a') },
            was: { path: path.normalize('dirA/dir/empty-subdir-a') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/subdir') },
            was: { path: path.normalize('dirA/dir/subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirC/dir/subdir/empty-subsubdir') },
            was: { path: path.normalize('dirA/dir/subdir/empty-subsubdir') }
          },
          {
            type: 'DirMove',
            doc: { path: path.normalize('dirA') },
            was: { path: path.normalize('dirB') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir') },
            was: { path: path.normalize('dirB/dir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/empty-subdir') },
            was: { path: path.normalize('dirB/dir/empty-subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/empty-subdir-b') },
            was: { path: path.normalize('dirB/dir/empty-subdir-b') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/subdir') },
            was: { path: path.normalize('dirB/dir/subdir') }
          },
          {
            type: 'DescendantChange',
            doc: { path: path.normalize('dirA/dir/subdir/empty-subsubdir') },
            was: { path: path.normalize('dirB/dir/subdir/empty-subsubdir') }
          }
        ])
      })
    })
  })
})

describe('isChildSource(p, c)', () => {
  it('returns true if p src path is parent of c src path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst2/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src/dir/subdir/file') }
    }

    should(remoteChange.isChildSource(parent, child)).be.true()
  })

  it('returns false if p src path is not parent of c src path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst/subdir/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src2/file') }
    }

    should(remoteChange.isChildSource(parent, child)).be.false()
  })
})

describe('isChildDestination(p, c)', () => {
  it('returns true if p dst path is parent of c dst path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst/subdir/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src2/file') }
    }

    should(remoteChange.isChildDestination(parent, child)).be.true()
  })

  it('returns false if p dst path is not parent of c dst path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst2/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src/dir/subdir/file') }
    }

    should(remoteChange.isChildDestination(parent, child)).be.false()
  })
})

describe('isChildMove(p, c)', () => {
  it('returns true if p src path is parent of c src path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst2/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src/dir/subdir/file') }
    }

    should(remoteChange.isChildSource(parent, child)).be.true()
  })

  it('returns true if p dst path is parent of c dst path', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst/subdir/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src2/file') }
    }

    should(remoteChange.isChildDestination(parent, child)).be.true()
  })

  it('returns true if p src and dst paths are parents of c src and dst paths', () => {
    const parent = {
      doc: { path: path.normalize('parent/dst2/subdir') },
      type: 'DirMove',
      was: { path: path.normalize('parent/src/dir/subdir') }
    }
    const child = {
      doc: { path: path.normalize('parent/dst2/subdir/file') },
      type: 'FileMove',
      was: { path: path.normalize('parent/src/dir/subdir/file') }
    }

    should(remoteChange.isChildMove(parent, child)).be.true()
  })
})

describe('isOnlyChildMove(p, c)', () => {
  const p = {
    doc: { path: path.normalize('dst') },
    type: 'DirMove',
    was: { path: path.normalize('src') }
  }

  it('returns false if c is not a move', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileDeletion'
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('src/file') },
      type: 'FileDeletion'
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()
  })

  it('returns false if c is not a move of a child of p', () => {
    const c1 = {
      doc: { path: path.normalize('dir/file') },
      type: 'FileMove',
      was: { path: path.normalize('file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileMove',
      was: { path: path.normalize('file') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: path.normalize('src/file') },
      type: 'FileMove',
      was: { path: path.normalize('file') }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: path.normalize('src/dir') },
      type: 'DirMove',
      was: { path: path.normalize('dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()

    const c5 = {
      doc: { path: path.normalize('dst/dir') },
      type: 'DirMove',
      was: { path: path.normalize('dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c5)).be.false()

    const c6 = {
      doc: { path: path.normalize('parent/dir') },
      type: 'DirMove',
      was: { path: path.normalize('dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c6)).be.false()
  })

  it('returns false if c is a move of a child of p outside p', () => {
    const c1 = {
      doc: { path: path.normalize('file') },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('file') },
      type: 'FileMove',
      was: { path: path.normalize('dst/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: path.normalize('dir') },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: path.normalize('dir') },
      type: 'DirMove',
      was: { path: path.normalize('dst/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns false if c is a renaming of a child of p within p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file2') },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('dst/dir2') },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: path.normalize('dst/file2') },
      type: 'FileMove',
      was: { path: path.normalize('dst/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: path.normalize('dst/dir2') },
      type: 'DirMove',
      was: { path: path.normalize('dst/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns true if c is a child move of p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.true()

    const c2 = {
      doc: { path: path.normalize('dst/dir') },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.true()
  })

  it('returns false if c is a child move of a move of a child of p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/dir2/file') },
      type: 'FileMove',
      was: { path: path.normalize('src/dir/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('dst/parent2/dir') },
      type: 'DirMove',
      was: { path: path.normalize('src/parent/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()
  })
})

describe('sortByPath', () => {
  it('sorts changes by ascending alphanumerical destination path order', () => {
    const one = {
      doc: { path: path.normalize('dst/dir/file') },
      type: 'FileMove',
      was: { path: path.normalize('dir/file') }
    }
    const two = {
      doc: { path: path.normalize('dst/dir') },
      type: 'DirMove',
      was: { path: path.normalize('dir') }
    }
    const three = {
      doc: { path: path.normalize('dst/dir/file2') },
      type: 'FileMove',
      was: { path: path.normalize('a/file2') }
    }
    const four = {
      doc: { path: path.normalize('dst/dir/spreadsheet') },
      type: 'FileAddition'
    }
    const five = {
      doc: { path: path.normalize('doc') },
      type: 'FileAddition'
    }

    should(remoteChange.sortByPath([one, two, three, four, five])).deepEqual([
      five,
      two,
      one,
      three,
      four
    ])
  })

  it('is normalization agnostic', () => {
    // XXX: A string encoded with NFC is alphanumerically smaller than the same
    // string encoded with NFD.

    const one = {
      doc: {
        path: path.join(
          'décibels'.normalize('NFD'),
          'hélice'.normalize('NFC'),
          'file'
        )
      },
      type: 'FileMove',
      was: { path: path.normalize('dir/file') }
    }
    const two = {
      doc: {
        path: path.join('décibels'.normalize('NFC'), 'hélice'.normalize('NFD'))
      },
      type: 'DirMove',
      was: { path: path.normalize('dir') }
    }
    const three = {
      doc: { path: path.normalize('décibels/hélice/file2'.normalize('NFC')) },
      type: 'FileMove',
      was: { path: path.normalize('a/file2') }
    }
    const four = {
      doc: {
        path: path.normalize('décibels/hélice/spreadsheet'.normalize('NFD'))
      },
      type: 'FileAddition'
    }
    const five = {
      doc: { path: path.normalize('décibel'.normalize('NFC')) },
      type: 'FileAddition'
    }

    should(remoteChange.sortByPath([one, two, three, four, five])).deepEqual([
      five,
      two,
      one,
      three,
      four
    ])
  })

  it('sorts changes without paths last', () => {
    const one = {
      type: 'IgnoredChange',
      doc: { _id: 'whatever', _rev: '2-xxx', _deleted: true },
      was: builders.metafile().path('spreadsheet').build(),
      detail: 'Deleted document'
    }
    const two = {
      doc: builders.metafile().path('doc').build(),
      type: 'FileAddition'
    }
    const three = {
      type: 'IgnoredChange',
      doc: { _id: 'whatever', _rev: '2-xxx', _deleted: true },
      was: builders.metadir().path('dir').build(),
      detail: 'Deleted document'
    }

    should(remoteChange.sortByPath([one, two, three])).deepEqual([
      two,
      one,
      three
    ])
  })
})
