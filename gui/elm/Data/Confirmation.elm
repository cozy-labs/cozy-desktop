port module Data.Confirmation exposing (Confirmation, ConfirmationID, askForConfirmation, gotConfirmation, newId)

-- Careful! To be sure to match requests with responses, you need to have the
-- same ConfirmationID as the first tuple member in both functions.
--
-- e.g.
--   id = ConfirmationID "AreYouOK"
--
--   askForConfirmation (id, "Are you OK?")
--   gotConfirmation (id, True)


type ConfirmationID
    = ConfirmationID String


type alias Confirmation =
    { id : ConfirmationID
    , title : String
    , message : String
    , detail : String
    , mainAction : String
    }


newId : String -> ConfirmationID
newId id =
    ConfirmationID id



-- Ports


type alias EncodedConfirmation =
    { id : String
    , title : String
    , message : String
    , detail : String
    , mainAction : String
    }


port confirm : EncodedConfirmation -> Cmd msg


port confirmations : (( String, Bool ) -> msg) -> Sub msg


askForConfirmation : Confirmation -> Cmd msg
askForConfirmation confirmation =
    confirm (encode confirmation)


gotConfirmation : (( ConfirmationID, Bool ) -> msg) -> Sub msg
gotConfirmation msg =
    confirmations (msg << decodeId)


encode : Confirmation -> EncodedConfirmation
encode { id, title, message, detail, mainAction } =
    { id = encodeId id
    , title = title
    , message = message
    , detail = detail
    , mainAction = mainAction
    }


encodeId : ConfirmationID -> String
encodeId (ConfirmationID id) =
    id


decodeId : ( String, Bool ) -> ( ConfirmationID, Bool )
decodeId ( id, confirmed ) =
    ( ConfirmationID id, confirmed )
