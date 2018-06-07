module Data.UserActionRequiredError exposing (UserActionRequiredError)


type alias UserActionRequiredError =
    { title : String
    , code : String
    , detail : String
    , links :
        { self : String
        }
    }
