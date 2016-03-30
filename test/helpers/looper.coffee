module.exports =

    check: (callback, done, delai=1000, test=8) ->
        console.log "check: #{test}"
        setTimeout ->
            callback (err) ->
                console.log "err", err
                if err and test > 0
                    @check callback, delai, test - 1
                else
                    done.apply @, arguments
        , delai
