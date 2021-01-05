module Data.SyncState exposing (EncodedSyncState, SyncState, decode, init)

import Data.Status as Status exposing (Status)


type alias SyncState =
    { status : Status
    }


init : SyncState
init =
    { status = Status.init
    }



-- Communicate through Ports


type alias EncodedSyncState =
    { status : String
    , remaining : Int
    }


decode : EncodedSyncState -> SyncState
decode { status, remaining } =
    { status = Status.fromString status remaining
    }
