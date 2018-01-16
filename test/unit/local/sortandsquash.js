/* eslint-env mocha */

import should from 'should'

import sortAndSquash from '../../../core/local/sortandsquash'

import type { ContextualizedChokidarFSEvent } from '../../../core/local/chokidar_event'
import type { PrepAction } from '../../../core/local/prep_action'

describe('SortAndSquash Unit Tests', function () {
  it('do not break on empty array', () => {
    const events: ContextualizedChokidarFSEvent[] = []
    const pendingActions: PrepAction[] = []
    const result: PrepAction[] = sortAndSquash(events, pendingActions)
    should(result).have.length(0)
  })
})
