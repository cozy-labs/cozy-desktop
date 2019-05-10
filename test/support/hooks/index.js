/** Load all global test hooks at once.
 *
 * Test support modules including global hooks (e.g. `before`, `beforeEach`,
 * `after` or `afterEach` calls not inside a `describe` block) must be passed
 * to mocha the same way as test files, not using `--require` / `mocha.opts`.
 * Otherwise Node.js will complain about the missing hook functions.
 *
 * Hooks may be split into multiple files to improve readability / maintenance.
 * But passing all of those files to the `mocha` command would be cumbersome.
 * Instead, this module acts as a single entry-point for them.
 *
 * See the `yarn mocha` script.
 */

require('./logging')
require('./proxy')
