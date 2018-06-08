module Data.RemoteWarning exposing (RemoteWarning)


type alias RemoteWarning =
    { title : String
    , code : String
    , detail : String
    , links :
        { self : String
        }
    }
