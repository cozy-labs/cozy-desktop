/** Load all global test hooks at once.
 *
 * When using mocha, test support code that does not include global
 * before/after hooks can be loaded using `--require` (optionaly via
 * `./test/mocha.opts`).
 *
 * But test support code including global hooks must be passed as an argument
 * to the `mocha` command the same way as tests. Passing multiple modules to
 * the command would make it too long, hence the single entry point.
 */

require('./logging')
