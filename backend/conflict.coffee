pouch = require './db'
publisher = require './publisher'
log = require('printit')
    prefix: 'Conflict Handler'

module.exports = conflict =

    # Display the conflict informations (for debugging purpose).
    displayConflict: (err) ->
        log.debug err

    # Apply a proper resolution conflict strategy to the conflict.
    handleConflict: ->
