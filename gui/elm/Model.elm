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


type alias UserActionRequiredError =
    { title : String
    , details : String
    , links :
        { action : String
        }
    }
