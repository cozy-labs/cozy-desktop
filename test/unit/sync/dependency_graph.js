const should = require('should')

const { DependencyGraph } = require('../../../core/sync/dependency_graph')

// The dependencies are defined as a map of Path -> Path dependencies
const dependencyBasedCompare = dependencies => (
  { doc: { path: pathA } },
  { doc: { path: pathB } }
) => {
  if (dependencies[pathA] && dependencies[pathA].includes(pathB)) return 1
  if (dependencies[pathB] && dependencies[pathB].includes(pathA)) return -1
  return 0
}

describe('DependencyGraph', () => {
  describe('toArray', () => {
    it('returns an array of the graph nodes ordered by their dependencies', () => {
      const dependencies = {
        a: ['b', 'c', 'd'],
        b: ['c', 'i'],
        c: ['d', 'e'],
        e: ['f'],
        f: ['d']
      }
      const changes = {
        a: {
          doc: { path: 'a' }
        },
        b: {
          doc: { path: 'b' }
        },
        c: {
          doc: { path: 'c' }
        },
        d: {
          doc: { path: 'd' }
        },
        e: {
          doc: { path: 'e' }
        },
        f: {
          doc: { path: 'f' }
        },
        g: {
          doc: { path: 'g' }
        },
        h: {
          doc: { path: 'h' }
        },
        i: {
          doc: { path: 'i' }
        }
      }
      const compare = dependencyBasedCompare(dependencies)
      const graph = new DependencyGraph(
        [
          changes.h,
          changes.a,
          changes.b,
          changes.c,
          changes.d,
          changes.e,
          changes.f,
          changes.i,
          changes.g
        ],
        { compare }
      )

      const orderedChanges = graph.toArray()
      should(orderedChanges).has.length(Object.keys(changes).length)
      should(orderedChanges).deepEqual([
        changes.h,
        changes.d,
        changes.f,
        changes.e,
        changes.c,
        changes.i,
        changes.b,
        changes.a,
        changes.g
      ])
    })

    it('correctly sorts inter-dependencies between dependencies', () => {
      const changes = {
        a: { doc: { path: 'a' } },
        b: { doc: { path: 'b' } },
        c: { doc: { path: 'c' } },
        d: { doc: { path: 'd' } }
      }
      const dependencies = {
        a: ['b', 'c'],
        b: ['d'],
        c: [],
        d: ['c']
      }
      const compare = dependencyBasedCompare(dependencies)
      const graph = new DependencyGraph(
        [changes.a, changes.b, changes.c, changes.d],
        {
          compare
        }
      )

      const orderedChanges = graph.toArray()
      should(orderedChanges).has.length(Object.keys(changes).length)
      should(orderedChanges).deepEqual([
        changes.c,
        changes.d,
        changes.b,
        changes.a
      ])
    })

    it('is resilient to simple forward circular dependencies', () => {
      const changes = {
        a: { doc: { path: 'a' } },
        b: { doc: { path: 'b' } },
        c: { doc: { path: 'c' } }
      }
      const dependencies = {
        a: ['b'],
        b: ['c'],
        c: ['a']
      }
      const compare = dependencyBasedCompare(dependencies)
      const graph = new DependencyGraph([changes.a, changes.b, changes.c], {
        compare
      })

      const orderedChanges = graph.toArray()
      should(orderedChanges).has.length(Object.keys(changes).length)
      should(orderedChanges).deepEqual([changes.b, changes.a, changes.c])
    })

    it('is resilient to simple backward circular dependencies', () => {
      const changes = {
        a: { doc: { path: 'a' } },
        b: { doc: { path: 'b' } },
        c: { doc: { path: 'c' } }
      }
      const dependencies = {
        a: ['c'],
        b: ['a'],
        c: ['b']
      }
      const compare = dependencyBasedCompare(dependencies)
      const graph = new DependencyGraph([changes.a, changes.b, changes.c], {
        compare
      })

      const orderedChanges = graph.toArray()
      should(orderedChanges).has.length(Object.keys(changes).length)
      should(orderedChanges).deepEqual([changes.c, changes.a, changes.b])
    })

    it('is resilient to complex circular dependencies', () => {
      const changes = {
        a: { doc: { path: 'a' } },
        b: { doc: { path: 'b' } },
        c: { doc: { path: 'c' } },
        d: { doc: { path: 'd' } },
        e: { doc: { path: 'e' } }
      }
      const dependencies = {
        a: ['b'],
        b: ['e'],
        c: ['a'],
        d: ['b', 'c'],
        e: ['d']
      }
      const compare = dependencyBasedCompare(dependencies)
      const graph = new DependencyGraph(
        [changes.a, changes.b, changes.c, changes.d, changes.e],
        {
          compare
        }
      )

      const orderedChanges = graph.toArray()
      should(orderedChanges).has.length(Object.keys(changes).length)
      should(orderedChanges).deepEqual([
        changes.e,
        changes.b,
        changes.a,
        changes.c,
        changes.d
      ])
    })
  })
})
