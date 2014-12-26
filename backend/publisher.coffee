events = require 'events'

# Publish event, useful to transmit info to the GUI.
module.exports = publisher = new events.EventEmitter()
