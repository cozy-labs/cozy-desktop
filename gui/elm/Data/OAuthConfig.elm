port module Data.OAuthConfig exposing (OAuthConfig, gotOIDCLoginURL, init, setError, setOIDCLoginURL)


type alias OAuthConfig =
    { error : String
    , busy : Bool
    , oidcLoginURL : Maybe String
    }


init : OAuthConfig
init =
    { error = ""
    , busy = False
    , oidcLoginURL = Nothing
    }


setError : OAuthConfig -> String -> OAuthConfig
setError oauthConfig error =
    { oauthConfig | error = error, busy = False }


setOIDCLoginURL : OAuthConfig -> String -> OAuthConfig
setOIDCLoginURL oauthConfig url =
    { oauthConfig | oidcLoginURL = Just url }



-- Ports


port oidcLoginURL : (String -> msg) -> Sub msg


gotOIDCLoginURL : (String -> msg) -> Sub msg
gotOIDCLoginURL msg =
    oidcLoginURL msg
