pouch = require './db'
publisher = require './publisher'
log = require('printit')
    prefix: 'Conflict Handler'

module.exports = conflict =

    # Display the conflict informations (for debugging purpose).
    displayConflict: (err, info) ->
        log.debug err
        log.debug info

    # Apply a proper resolution conflict strategy to the conflict.
    handleConflict: ->
        log.debug "handleConflict"
