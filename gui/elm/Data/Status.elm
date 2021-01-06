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


fromString : String -> Int -> Status
fromString str remaining =
    case str of
        "sync" ->
            Syncing remaining

        "buffering" ->
            Buffering

        "squashprepmerge" ->
            SquashPrepMerging

        "uptodate" ->
            UpToDate

        "user-action-required" ->
            UserActionRequired

        "offline" ->
            Offline

        _ ->
            UpToDate
