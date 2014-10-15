# Sets of helper functions


isValidForm = (fields) ->
    for field in fields
        return false unless field.isValid()
    return true
