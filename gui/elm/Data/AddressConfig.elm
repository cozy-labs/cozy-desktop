module Data.AddressConfig exposing (AddressConfig, init, setError)


type alias AddressConfig =
    { address : String
    , error : String
    , busy : Bool
    }


init : AddressConfig
init =
    { address = ""
    , error = ""
    , busy = False
    }


setError : AddressConfig -> String -> AddressConfig
setError addressConfig error =
    { addressConfig | error = error, busy = False }
