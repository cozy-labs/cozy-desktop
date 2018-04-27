module Model exposing (..)


type Status
    = Starting
    | UpToDate
    | Offline
    | UserActionRequired
    | Buffering
    | SquashPrepMerging
    | Syncing Int
    | Error String


type Platform
    = Windows
    | Linux
    | Darwin


type alias RemoteWarning =
    { title : String
    , code : String
    , detail : String
    , links :
        { self : String
        }
    }


type alias UserActionRequiredError =
    { title : String
    , code : String
    , detail : String
    , links :
        { self : String
        }
    }
