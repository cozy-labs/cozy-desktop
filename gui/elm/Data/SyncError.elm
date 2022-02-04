module Data.SyncError exposing
    ( EncodedSyncError
    , SyncError(..)
    , decode
    , decodeLatest
    , message
    )


type SyncError
    = CozyNotFound
    | CozyClientRevoked
    | MissingPermissions
    | None
    | SynchronizationImpossible


type alias EncodedSyncError =
    { name : String
    , code : String
    }


decode : EncodedSyncError -> SyncError
decode { name, code } =
    case code of
        "CozyNotFound" ->
            CozyNotFound

        "CozyClientRevoked" ->
            CozyClientRevoked

        "MissingPermissions" ->
            MissingPermissions

        _ ->
            SynchronizationImpossible


decodeLatest : List EncodedSyncError -> SyncError
decodeLatest errors =
    List.reverse errors
        |> List.head
        |> Maybe.map decode
        |> Maybe.withDefault None


message : SyncError -> String
message error =
    case error of
        CozyNotFound ->
            "Error Your Cozy could not be found"

        CozyClientRevoked ->
            "Cozy client has been revoked"

        MissingPermissions ->
            "Dashboard Synchronization impossible"

        None ->
            ""

        SynchronizationImpossible ->
            "Dashboard Synchronization impossible"
