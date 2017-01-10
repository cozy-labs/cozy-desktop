// The password used for integration tests:
let password = 'CozyTest$1';

// You can retrieve it by requiring this module:
//     password = require '.../password'
export default password;

// Running this script directly with the `coffeescript` command prints the
// password to the console (useful for scripting, e.g. on Travis).
if (require.main === module) { console.log(password); }
