module Data.SyncState exposing (EncodedSyncState, SyncState, decode, init)

import Data.Status as Status exposing (Status)
import Data.UserAction as UserAction exposing (EncodedUserAction, UserAction)


type alias SyncState =
    { status : Status
    , userActions : List UserAction
    }


init : SyncState
init =
    { status = Status.init
    , userActions = []
    }



-- Communicate through Ports


type alias EncodedSyncState =
    { status : String
    , remaining : Int
    , userActions : List EncodedUserAction
    }


decode : EncodedSyncState -> SyncState
decode { status, remaining, userActions } =
    let
        decodedActions =
            List.foldr
                (\a list ->
                    case UserAction.decode a of
                        Just d ->
                            d :: list

                        _ ->
                            list
                )
                []
                userActions
    in
    { status = Status.fromString status remaining
    , userActions = decodedActions
    }
