# The password used for integration tests:
password = 'CozyTest$1'

# You can retrieve it by requiring this module:
#     password = require '.../password'
module.exports = password

# Running this script directly with the `coffeescript` command prints the
# password to the console (useful for scripting, e.g. on Travis).
console.log password if require.main is module
