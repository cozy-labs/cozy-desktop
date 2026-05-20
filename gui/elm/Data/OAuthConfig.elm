module Data.OAuthConfig exposing (OAuthConfig, init, setError)


type alias OAuthConfig =
    { error : String
    , busy : Bool
    }


init : OAuthConfig
init =
    { error = ""
    , busy = False
    }


setError : OAuthConfig -> String -> OAuthConfig
setError oauthConfig error =
    { oauthConfig | error = error, busy = False }
