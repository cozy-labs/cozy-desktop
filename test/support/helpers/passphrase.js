'use strict'

// The passphrase used for integration tests:
let passphrase = process.env.COZY_PASSPHRASE || 'CozyTest_1'

// You can retrieve it by requiring this module:
//     passphrase = require '.../passphrase'
module.exports = passphrase

// Running this script directly with `node` or `babel-node` prints the
// passphrase to the console (useful for scripting, e.g. on Travis).
if (require.main === module) { console.log(passphrase) }
