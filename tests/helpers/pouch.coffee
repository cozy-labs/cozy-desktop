Pouch = require '../../backend/pouch'


module.exports =
    createDatabase: (done) ->
        @pouch = new Pouch @config
        @pouch.addAllFilters done

    cleanDatabase: (done) ->
        @pouch.db.destroy =>
            @pouch = null
            done()
