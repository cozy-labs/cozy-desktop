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
    , details : String
    , links :
        { action : String
        }
    }


type alias UserActionRequiredError =
    { title : String
    , error : String
    , details : String
    , links :
        { action : String
        }
    }
