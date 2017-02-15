'use strict'

// The password used for integration tests:
let password = process.env.COZY_PASSPHRASE || 'CozyTest_1'

// You can retrieve it by requiring this module:
//     password = require '.../password'
module.exports = password

// Running this script directly with `node` or `babel-node` prints the
// password to the console (useful for scripting, e.g. on Travis).
if (require.main === module) { console.log(password) }
