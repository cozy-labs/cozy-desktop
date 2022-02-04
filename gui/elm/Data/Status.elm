module Data.Status exposing (Status(..), fromString, init)


type Status
    = Starting
    | UpToDate
    | Offline
    | UserActionRequired
    | Buffering
    | SquashPrepMerging
    | Syncing Int
    | Error String


init : Status
init =
    Starting


fromString : String -> Int -> String -> Status
fromString str remaining latestError =
    case str of
        "syncing" ->
            Syncing remaining

        "buffering" ->
            Buffering

        "squashprepmerge" ->
            SquashPrepMerging

        "uptodate" ->
            UpToDate

        "user-alert" ->
            UserActionRequired

        "offline" ->
            Offline

        "error" ->
            Error latestError

        _ ->
            UpToDate
