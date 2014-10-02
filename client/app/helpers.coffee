# Sets of helper functions


isValidForm = (fields) ->
    for field in fields
        unless field.isValid()
            return false
    true
