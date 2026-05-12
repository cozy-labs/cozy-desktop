module Data.EmailConfig exposing (EmailConfig, init, setError)


type alias EmailConfig =
    { address : String
    , error : String
    , busy : Bool
    }


init : EmailConfig
init =
    { address = ""
    , error = ""
    , busy = False
    }


setError : EmailConfig -> String -> EmailConfig
setError emailConfig error =
    { emailConfig | error = error, busy = False }
