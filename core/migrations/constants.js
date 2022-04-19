/**
 * @module core/migrations/constants
 * @flow
 */

/*::
import type { Pouch } from '../pouch'
import type { Remote } from '../remote'

export type SchemaVersion = number
*/

const SCHEMA_DOC_ID = '_local/schema'
const SCHEMA_INITIAL_VERSION = 0
const INITIAL_SCHEMA = {
  _id: SCHEMA_DOC_ID,
  version: SCHEMA_INITIAL_VERSION
}
const MIGRATION_RESULT_NOOP = 'MigrationNoop'
const MIGRATION_RESULT_COMPLETE = 'MigrationComplete'
const MIGRATION_RESULT_FAILED = 'MigrationFailed'

module.exports = {
  SCHEMA_DOC_ID,
  SCHEMA_INITIAL_VERSION,
  INITIAL_SCHEMA,
  MIGRATION_RESULT_NOOP,
  MIGRATION_RESULT_COMPLETE,
  MIGRATION_RESULT_FAILED
}
