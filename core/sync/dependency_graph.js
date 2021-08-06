/**
 * @module core/sync/dependency_graph
 * @flow
 *
 * To know what changes were made on each side of the synchronization (i.e. the
 * local filesystem and the remote Cozy) and what to propagate, we fetch the
 * modified PouchDB records via PouchDB's changesfeed. The result is a list of
 * modified records along with a sequence number representing the order in which
 * each modification was made. However, multiple modifications to the same
 * record won't result in the same record appearing multiple times in the feed.
 * We'll only get the latest version of the record along with the latest
 * associated sequence.
 *
 * This means that we can't rely on the sequence order to know in which order
 * modifications were made and thus in which order we should propagate them to
 * the other side.
 * This is where this dependency graph comes in.
 *
 * Each Node of the directed DependencyGraph represents a Change (or multiple
 * changes in some cases like a file move with a content update). Edges are
 * stored in the Node's `dependentOn` attribute as a list of other Nodes which
 * need to be synchronized before the current Node.
 *
 * e.g. if change A needs to be synchronized before changes C and D which in
 * turn needs to be synchronized before change B, we have:
 *
 *   Nodes = [
 *     {
 *       change: A,
 *       dependentOn: []
 *     },
 *     {
 *       change: B,
 *       dependentOn: [D]
 *     },
 *     {
 *       change: C,
 *       dependentOn: [A]
 *     },
 *     {
 *       change: D,
 *       dependentOn: [A]
 *     }
 *   ]
 *
 *
 * Once all the dependencies are expressed, we can expand the graph into an
 * ordered list of Changes to propagate.
 *
 * Warning: a directed graph can contain cycles (i.e. paths that start from one
 * Node and go back to the same Node) which can't be expanded into a list. Since
 * we need that list to propagate the changes and breaking those cycles is a
 * difficult task afterwards (it's time consuming and deciding where to break
 * the cycle is difficult in itself), we chose to avoid creating cycles
 * altogether.
 * We do this by skipping a dependency relation every time it would create a
 * cycle.
 *
 * e.g. if change A is dependent on change B which is dependent on change C
 * which is dependent on change A, we have:
 *
 *   Nodes = [
 *     {
 *       change: A,
 *       dependentOn: [B]
 *     },
 *       change: B,
 *       dependentOn: []
 *     },
 *     {
 *       change: C,
 *       dependentOn: [A]
 *     }
 *   ]
 *
 * You can see that the dependency between B and C has been skipped when adding
 * C to the graph as it would create a cycle (i.e. we compare A and C before
 * comparing B and C so the dependency betwee C and A is preserved).
 */

/*::
import type { Change } from './'

type GraphOptions = {
  compare: (Change, Change) => number
}
type Node = {
  change: Change,
  dependentOn: Node[],
};
*/

class DependencyGraph {
  /*::
  nodes: Node[]
  compare: (Change, Change) => number
  */

  // The compare method is expected to be the kind of method that would be
  // passed to `Array.sort()`. It should return:
  // - a negative value when its first Change argument should be propagated
  //   before its second Change argument
  // - a positive value when the second Change should be propagated before the
  //   first one
  // - 0 when either Change can be propagated first
  constructor(changes /*: Change[] */, { compare } /*: GraphOptions */) {
    this.compare = compare
    this.nodes = []

    for (const change of changes) {
      this.insert(change)
    }
  }

  // Create a new Node from the given change and compute all the edges between
  // this Node and the other Nodes in the graph by comparing changes together.
  insert(change /*: Change */) {
    const newNode = {
      change,
      dependentOn: []
    }

    for (const node of this.nodes) {
      const order = this.compare(node.change, newNode.change)

      if (order < 0) {
        // node should come first
        newNode.dependentOn.push(node)

        if (createsCycle(newNode)) {
          // We can't deal with circular dependencies for now so we simply avoid
          // them altogether.
          // This means we might end up with dependent changes being
          // synchronized before their dependencies but at least we won't end up
          // in an infinite loop when expanding the graph into a sorted array.
          newNode.dependentOn.splice(-1)
        }
      } else if (order > 0) {
        // newNode should come first
        node.dependentOn.push(newNode)

        if (createsCycle(newNode)) {
          // We can't deal with circular dependencies for now so we simply avoid
          // them altogether.
          // This means we might end up with dependent changes being
          // synchronized before their dependencies but at least we won't end up
          // in an infinite loop when expanding the graph into a sorted array.
          node.dependentOn.splice(-1)
        }
      } else {
        // No dependencies between node and newNode
      }
    }

    this.nodes.push(newNode)
  }

  // Expand the graph into an ordered list of Change objects which can be used
  // by Sync to propagate them.
  toArray() /*: Change[] */ {
    const visited = new Set()

    // Since nodes are added grossly in order and the graph is about integrating
    // the few priorities that could be out of order in PouchDB, we can start
    // visiting the nodes from the first one.
    // If other nodes should have a greater priority than the first one, they
    // will be visited and thus have a greater final priority.
    for (const node of this.nodes) {
      visitNodesInOrder(node, visited)
    }

    return Array.from(visited).map(node => node.change)
  }
}

// Visit the sub-graph represented by the given node and its dependencies to
// form an ordered list of nodes based on these dependencies which are directed
// edges.
function visitNodesInOrder(
  node /*: Node */,
  visited /*: Set<Node> */
) /*: void */ {
  if (!visited.has(node)) {
    for (const dependency of node.dependentOn) {
      visitNodesInOrder(dependency, visited)
    }
    visited.add(node)
  }
}

// Based on solution found at
// https://trykv.medium.com/algorithms-on-graphs-directed-graphs-and-cycle-detection-3982dfbd11f5
function createsCycle(node /*: Node */) /*: boolean */ {
  const visited = new Set()
  const exploring = new Set()

  return foundCycleViaDFS(node, { visited, exploring })
}

// This method performs a Depth-Frist Search to explore all the nodes accessible
// from the given node via its `dependentOn` neighbors.
// If we come across a node actively being explored, then we have a cycle.
// Once we've explored all paths starting from the given node and haven't found
// any cycles, then we can mark the node as visited and move on to the next one.
function foundCycleViaDFS(
  node /*: Node */,
  { visited, exploring } /*: { visited: Set<Node>, exploring: Set<Node> } */
) /*: boolean */ {
  // if the node has been visited, that means there are no cycles
  if (visited.has(node)) return false
  // if we're on a current path and we come across a node that is currently
  // being explored, there's a cycle.
  if (exploring.has(node)) return true
  // mark the node as being explored
  exploring.add(node)
  const dependencies = node.dependentOn
  for (const dependency of dependencies) {
    if (!visited.has(dependency)) {
      const cycleDetected = foundCycleViaDFS(dependency, { visited, exploring })
      // if the neighbor being explored is already marked as explored, then we
      // have a cycle.
      if (cycleDetected) return true
    }
  }
  // if we break out here, then we have not found a cycle on any path starting
  // from this node.
  exploring.delete(node)
  visited.add(node)
  return false
}

module.exports = {
  DependencyGraph
}
