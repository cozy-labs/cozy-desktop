/* eslint-env mocha */

const path = require('path')
const should = require('should')

const remoteChange = require('../../../core/remote/change')
const { onPlatforms } = require('../../support/helpers/platform')
const Builders = require('../../support/builders')

const builders = new Builders()

describe('sorter()', () => {
  describe('with identical additions', () => {
    it('sorts FOO before foo', () => {
      const subdirAdd = {
        doc: builders.metadir().path('FOO/subdir').build(),
        type: 'DirAddition'
      }
      const otherDirAdd = {
        doc: builders.metadir().path('foo').build(),
        type: 'DirAddition'
      }
      const fileAdd = {
        doc: builders.metafile().path('FOO/subdir/file').build(),
        type: 'FileAddition'
      }
      const dirAdd = {
        doc: builders.metadir().path('FOO').build(),
        type: 'DirAddition'
      }

      should(
        remoteChange.sort([subdirAdd, otherDirAdd, fileAdd, dirAdd])
      ).deepEqual([dirAdd, subdirAdd, fileAdd, otherDirAdd])
    })
  })

  describe('with two moves', () => {
    it('sorts child move out of parent before parent move', () => {
      const parentMove = {
        type: 'DirMove',
        doc: builders.metadir().path('moved').build(),
        was: builders.metadir().path('dir').build()
      }
      const childMove = {
        type: 'FileMove',
        doc: builders.metafile().path('file').build(),
        was: builders.metafile().path('dir/file').build()
      }

      should(remoteChange.sort([parentMove, childMove])).deepEqual([
        childMove,
        parentMove
      ])
      should(remoteChange.sort([childMove, parentMove])).deepEqual([
        childMove,
        parentMove
      ])
    })
  })

  describe('with replacing move', () => {
    it('sorts move of replaced before move of replacing', () => {
      const moveReplacing = {
        type: 'DirMove',
        doc: builders.metadir().path('dirA').build(),
        was: builders.metadir().path('dirB').build()
      }
      const moveReplaced = {
        type: 'DirMove',
        doc: builders.metadir().path('dirC').build(),
        was: builders.metadir().path('dirA').build()
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
        doc: builders.metadir().path('dirA/dir/subdir/empty-subsubdir').build(),
        was: builders.metadir().path('dirB/dir/subdir/empty-subsubdir').build()
      }
      const moveReplaced = {
        type: 'DirMove',
        doc: builders.metadir().path('dirC').build(),
        was: builders.metadir().path('dirA').build()
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
        doc: builders.metadir().path('dirA').build(),
        was: builders.metadir().path('dirB').build()
      }
      const moveReplaced = {
        type: 'DescendantChange',
        doc: builders.metadir().path('dirC/dir/empty-subdir-a').build(),
        was: builders.metadir().path('dirA/dir/empty-subdir-a').build()
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
        doc: builders.metadir().path('dirA/dir/subdir').build(),
        was: builders.metadir().path('dirB/dir/subdir').build()
      }
      const moveReplaced = {
        type: 'DescendantChange',
        doc: builders.metadir().path('dirC/dir/empty-subdir').build(),
        was: builders.metadir().path('dirA/dir/empty-subdir').build()
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
          doc: builders.metadir().path('.cozy_trash/DIR').build(),
          was: builders.metadir().path('dst/DIR').build()
        }
        const addition = {
          type: 'DirAddition',
          doc: builders.metadir().path('dst/dir').build()
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
          doc: builders.metadir().path('.cozy_trash/dir').build(),
          was: builders.metadir().path('dst/dir').build()
        }
        const addition = {
          type: 'DirAddition',
          doc: builders.metadir().path('dst/DIR').build()
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
          doc: builders.metadir().path('.cozy_trash/DIR').build(),
          was: builders.metadir().path('dst/DIR').build()
        }
        const move = {
          type: 'DirMove',
          doc: builders.metadir().path('dst/dir').build(),
          was: builders.metadir().path('src/dir').build()
        }
        should(remoteChange.sort([trashing, move])).deepEqual([trashing, move])
        should(remoteChange.sort([move, trashing])).deepEqual([trashing, move])
      })

      it('sorts tashing before move when moved change has lower path', () => {
        const trashing = {
          type: 'DirTrashing',
          doc: builders.metadir().path('.cozy_trash/dir').build(),
          was: builders.metadir().path('dst/dir').build()
        }
        const move = {
          type: 'DirMove',
          doc: builders.metadir().path('dst/DIR').build(),
          was: builders.metadir().path('src/DIR').build()
        }
        should(remoteChange.sort([trashing, move])).deepEqual([trashing, move])
        should(remoteChange.sort([move, trashing])).deepEqual([trashing, move])
      })
    })
  })

  describe('with move inside move', () => {
    it('sorts moves before descendant moves', () => {
      const fileMove2 = {
        type: 'FileMove',
        doc: builders
          .metafile()
          .path('parent/dst/dir/subdir/filerenamed2')
          .build(),
        was: builders.metafile().path('parent/dst/dir/subdir/file2').build()
      }
      const emptySubdirMove = {
        type: 'DescendantChange',
        doc: builders.metadir().path('parent/dst/dir/empty-subdir').build(),
        was: builders.metadir().path('parent/src/dir/empty-subdir').build()
      }
      const subdirMove = {
        type: 'DescendantChange',
        doc: builders.metadir().path('parent/dst/dir/subdir').build(),
        was: builders.metadir().path('parent/src/dir/subdir').build()
      }
      const fileMove = {
        type: 'FileMove',
        doc: builders
          .metafile()
          .path('parent/dst/dir/subdir/filerenamed')
          .build(),
        was: builders.metafile().path('parent/dst/dir/subdir/file').build()
      }
      const dirMove = {
        type: 'DirMove',
        doc: builders.metadir().path('parent/dst/dir').build(),
        was: builders.metadir().path('parent/src/dir').build()
      }

      const expected = [
        dirMove,
        fileMove,
        fileMove2,
        emptySubdirMove,
        subdirMove
      ]

      should(
        remoteChange.sort([
          fileMove2,
          emptySubdirMove,
          subdirMove,
          fileMove,
          dirMove
        ])
      ).deepEqual(expected)

      should(
        remoteChange.sort([
          fileMove2,
          emptySubdirMove,
          fileMove,
          subdirMove,
          dirMove
        ])
      ).deepEqual(expected)

      should(
        remoteChange.sort([
          fileMove,
          subdirMove,
          emptySubdirMove,
          dirMove,
          fileMove2
        ])
      ).deepEqual(expected)
    })
  })

  describe('sorts deleted before created for the same path', () => {
    const deleted = {
      type: 'FileDeletion',
      doc: builders.metafile().path('parent/file').build()
    }

    const created = {
      type: 'FileAddition',
      doc: builders.metafile().path('parent/file').build()
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
      const subsubdirAdd = {
        type: 'DirAddition',
        doc: builders
          .metadir()
          .path('2_Dossier/2_SousDossier/SousSousDossier')
          .build()
      }
      const fileAdd = {
        type: 'FileAddition',
        doc: builders
          .metafile()
          .path('2_Dossier/1_SousDossier/fichier.xml')
          .build()
      }
      const fileTrash = {
        type: 'FileTrashing',
        doc: builders.metafile().path('.cozy_trash/fichier.pptx').build(),
        was: builders.metafile().path('1_Dossier/fichier.pptx').build()
      }
      const replacingFileAdd = {
        type: 'FileAddition',
        doc: builders.metafile().path('1_Dossier/fichier.pptx').build()
      }

      should(
        remoteChange.sort([subsubdirAdd, fileAdd, fileTrash, replacingFileAdd])
      ).deepEqual([fileTrash, replacingFileAdd, fileAdd, subsubdirAdd])
    })

    context('with replacing move', () => {
      it('sorts replacing move after move of replaced', () => {
        const emptySubdiraMove = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirC/dir/empty-subdir-a').build(),
          was: builders.metadir().path('dirA/dir/empty-subdir-a').build()
        }
        const subdirMoveA = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirC/dir/subdir').build(),
          was: builders.metadir().path('dirA/dir/subdir').build()
        }
        const emptySubdirMoveA = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirC/dir/empty-subdir').build(),
          was: builders.metadir().path('dirA/dir/empty-subdir').build()
        }
        const emptySubsubdirMoveA = {
          type: 'DescendantChange',
          doc: builders
            .metadir()
            .path('dirC/dir/subdir/empty-subsubdir')
            .build(),
          was: builders
            .metadir()
            .path('dirA/dir/subdir/empty-subsubdir')
            .build()
        }
        const dirMoveA = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirC/dir').build(),
          was: builders.metadir().path('dirA/dir').build()
        }
        const parentMoveA = {
          type: 'DirMove',
          doc: builders.metadir().path('dirC').build(),
          was: builders.metadir().path('dirA').build()
        }
        const emptySubsubdirMoveB = {
          type: 'DescendantChange',
          doc: builders
            .metadir()
            .path('dirA/dir/subdir/empty-subsubdir')
            .build(),
          was: builders
            .metadir()
            .path('dirB/dir/subdir/empty-subsubdir')
            .build()
        }
        const dirMoveB = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirA/dir').build(),
          was: builders.metadir().path('dirB/dir').build()
        }
        const emptySubdirMoveB = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirA/dir/empty-subdir').build(),
          was: builders.metadir().path('dirB/dir/empty-subdir').build()
        }
        const emptySubdirbMove = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirA/dir/empty-subdir-b').build(),
          was: builders.metadir().path('dirB/dir/empty-subdir-b').build()
        }
        const subdirMoveB = {
          type: 'DescendantChange',
          doc: builders.metadir().path('dirA/dir/subdir').build(),
          was: builders.metadir().path('dirB/dir/subdir').build()
        }
        const parentMoveB = {
          type: 'DirMove',
          doc: builders.metadir().path('dirA').build(),
          was: builders.metadir().path('dirB').build()
        }

        should(
          remoteChange.sort([
            emptySubdiraMove,
            subdirMoveA,
            emptySubdirMoveA,
            emptySubsubdirMoveA,
            dirMoveA,
            parentMoveA,
            emptySubsubdirMoveB,
            dirMoveB,
            emptySubdirMoveB,
            emptySubdirbMove,
            subdirMoveB,
            parentMoveB
          ])
        ).deepEqual([
          parentMoveA,
          dirMoveA,
          emptySubdirMoveA,
          emptySubdiraMove,
          subdirMoveA,
          emptySubsubdirMoveA,
          parentMoveB,
          dirMoveB,
          emptySubdirMoveB,
          emptySubdirbMove,
          subdirMoveB,
          emptySubsubdirMoveB
        ])
      })
    })
  })

  describe('with deletion of parent', () => {
    context('when file is trashed within parent', () => {
      it('sorts parent deletion before child deletion', () => {
        const dirTrashing = {
          type: 'DirTrashing',
          doc: builders.metadir().path('.cozy_trash/dir').build(),
          was: builders.metadir().path('dir').build()
        }
        const fileTrashing = {
          type: 'FileTrashing',
          doc: builders.metafile().path('.cozy_trash/dir/file').build(),
          was: builders.metafile().path('dir/file').build()
        }
        should(remoteChange.sort([dirTrashing, fileTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
        should(remoteChange.sort([fileTrashing, dirTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
      })
    })

    context('when file is trashed outside parent', () => {
      it('sorts parent deletion before child deletion', () => {
        const dirTrashing = {
          type: 'DirTrashing',
          doc: builders.metadir().path('.cozy_trash/dir').build(),
          was: builders.metadir().path('dir').build()
        }
        const fileTrashing = {
          type: 'FileTrashing',
          doc: builders.metafile().path('.cozy_trash/file').build(),
          was: builders.metafile().path('dir/file').build()
        }
        should(remoteChange.sort([dirTrashing, fileTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
        should(remoteChange.sort([fileTrashing, dirTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
      })
    })

    context('when file was moved into parent', () => {
      // FIXME: this is not ideal as the child will be trashed outside of the
      // parent.
      // It would be best to sync the child move before its parent deletion.
      it('sorts parent deletion before child deletion', () => {
        const dirTrashing = {
          type: 'DirTrashing',
          doc: builders.metadir().path('.cozy_trash/dir').build(),
          was: builders.metadir().path('dir').build()
        }
        const fileTrashing = {
          type: 'FileTrashing',
          doc: builders.metafile().path('.cozy_trash/dir/file').build(),
          was: builders.metafile().path('dir/file').build()
        }
        should(remoteChange.sort([dirTrashing, fileTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
        should(remoteChange.sort([fileTrashing, dirTrashing])).deepEqual([
          dirTrashing,
          fileTrashing
        ])
      })
    })

    it('sorts child move out of parent before parent deletion', () => {
      const dirTrashing = {
        type: 'DirTrashing',
        doc: builders.metadir().path('.cozy_trash/dir').build(),
        was: builders.metadir().path('dir').build()
      }
      const fileMove = {
        type: 'FileMove',
        doc: builders.metafile().path('file').build(),
        was: builders.metafile().path('dir/file').build()
      }
      should(remoteChange.sort([dirTrashing, fileMove])).deepEqual([
        fileMove,
        dirTrashing
      ])
      should(remoteChange.sort([fileMove, dirTrashing])).deepEqual([
        fileMove,
        dirTrashing
      ])
    })
  })
})

describe('isChildSource(p, c)', () => {
  it('returns true if p src path is parent of c src path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst2/file').build(),
      was: builders.metafile().path('parent/src/dir/subdir/file').build()
    }

    should(remoteChange.isChildSource(parent, child)).be.true()
  })

  it('returns false if p src path is not parent of c src path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst/subdir/file').build(),
      was: builders.metafile().path('parent/src2/file').build()
    }

    should(remoteChange.isChildSource(parent, child)).be.false()
  })
})

describe('isChildDestination(p, c)', () => {
  it('returns true if p dst path is parent of c dst path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst/subdir/file').build(),
      was: builders.metafile().path('parent/src2/file').build()
    }

    should(remoteChange.isChildDestination(parent, child)).be.true()
  })

  it('returns false if p dst path is not parent of c dst path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst2/file').build(),
      was: builders.metafile().path('parent/src/dir/subdir/file').build()
    }

    should(remoteChange.isChildDestination(parent, child)).be.false()
  })
})

describe('isChildMove(p, c)', () => {
  it('returns true if p src path is parent of c src path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst2/file').build(),
      was: builders.metafile().path('parent/src/dir/subdir/file').build()
    }

    should(remoteChange.isChildSource(parent, child)).be.true()
  })

  it('returns true if p dst path is parent of c dst path', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst/subdir/file').build(),
      was: builders.metafile().path('parent/src2/file').build()
    }

    should(remoteChange.isChildDestination(parent, child)).be.true()
  })

  it('returns true if p src and dst paths are parents of c src and dst paths', () => {
    const parent = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dst2/subdir').build(),
      was: builders.metadir().path('parent/src/dir/subdir').build()
    }
    const child = {
      type: 'FileMove',
      doc: builders.metafile().path('parent/dst2/subdir/file').build(),
      was: builders.metafile().path('parent/src/dir/subdir/file').build()
    }

    should(remoteChange.isChildMove(parent, child)).be.true()
  })
})

describe('isOnlyChildMove(p, c)', () => {
  const p = {
    type: 'DirMove',
    doc: builders.metadir().path('dst').build(),
    was: builders.metadir().path('src').build()
  }

  it('returns false if c is not a move', () => {
    const c1 = {
      type: 'FileDeletion',
      doc: builders.metafile().path('dst/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      type: 'FileDeletion',
      doc: builders.metafile().path('src/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()
  })

  it('returns false if c is not a move of a child of p', () => {
    const c1 = {
      type: 'FileMove',
      doc: builders.metafile().path('dir/file').build(),
      was: builders.metafile().path('file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/file').build(),
      was: builders.metafile().path('file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      type: 'FileMove',
      doc: builders.metafile().path('src/file').build(),
      was: builders.metafile().path('file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      type: 'DirMove',
      doc: builders.metadir().path('src/dir').build(),
      was: builders.metadir().path('dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()

    const c5 = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/dir').build(),
      was: builders.metadir().path('dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c5)).be.false()

    const c6 = {
      type: 'DirMove',
      doc: builders.metadir().path('parent/dir').build(),
      was: builders.metadir().path('dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c6)).be.false()
  })

  it('returns false if c is a move of a child of p outside p', () => {
    const c1 = {
      type: 'FileMove',
      doc: builders.metafile().path('file').build(),
      was: builders.metafile().path('src/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      type: 'FileMove',
      doc: builders.metafile().path('file').build(),
      was: builders.metafile().path('dst/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      type: 'DirMove',
      doc: builders.metadir().path('dir').build(),
      was: builders.metadir().path('src/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      type: 'DirMove',
      doc: builders.metadir().path('dir').build(),
      was: builders.metadir().path('dst/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns false if c is a renaming of a child of p within p', () => {
    const c1 = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/file2').build(),
      was: builders.metafile().path('src/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/dir2').build(),
      was: builders.metadir().path('src/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/file2').build(),
      was: builders.metafile().path('dst/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/dir2').build(),
      was: builders.metadir().path('dst/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns true if c is a child move of p', () => {
    const c1 = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/file').build(),
      was: builders.metafile().path('src/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.true()

    const c2 = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/dir').build(),
      was: builders.metadir().path('src/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.true()
  })

  it('returns false if c is a child move of a move of a child of p', () => {
    const c1 = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/dir2/file').build(),
      was: builders.metafile().path('src/dir/file').build()
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/parent2/dir').build(),
      was: builders.metadir().path('src/parent/dir').build()
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()
  })
})

describe('sortByPath', () => {
  it('sorts changes by ascending alphanumerical destination path order', () => {
    const one = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/dir/file').build(),
      was: builders.metafile().path('dir/file').build()
    }
    const two = {
      type: 'DirMove',
      doc: builders.metadir().path('dst/dir').build(),
      was: builders.metadir().path('dir').build()
    }
    const three = {
      type: 'FileMove',
      doc: builders.metafile().path('dst/dir/file2').build(),
      was: builders.metafile().path('a/file2').build()
    }
    const four = {
      type: 'FileAddition',
      doc: builders.metafile().path('dst/dir/spreadsheet').build()
    }
    const five = {
      type: 'FileAddition',
      doc: builders.metafile().path('doc').build()
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
      type: 'FileMove',
      doc: {
        path: path.join(
          'décibels'.normalize('NFD'),
          'hélice'.normalize('NFC'),
          'file'
        )
      },
      was: builders.metafile().path('dir/file').build()
    }
    const two = {
      type: 'DirMove',
      doc: builders.metadir().path('décibels').build(),
      was: builders.metadir().path('dir').build()
    }
    const three = {
      type: 'FileMove',
      doc: { path: path.normalize('décibels/hélice/file2'.normalize('NFC')) },
      was: builders.metafile().path('a/file2').build()
    }
    const four = {
      type: 'FileAddition',
      doc: {
        path: path.normalize('décibels/hélice/spreadsheet'.normalize('NFD'))
      }
    }
    const five = {
      type: 'FileAddition',
      doc: { path: path.normalize('décibel'.normalize('NFC')) }
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
      type: 'FileAddition',
      doc: builders.metafile().path('doc').build()
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
