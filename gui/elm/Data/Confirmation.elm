port module Data.Confirmation exposing (ConfirmationID, askForConfirmation, gotConfirmation, newId)

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


type alias EncodedConfirmationID =
    String


newId : String -> ConfirmationID
newId id =
    ConfirmationID id


port confirm : ( EncodedConfirmationID, String ) -> Cmd msg


port confirmations : (( EncodedConfirmationID, Bool ) -> msg) -> Sub msg


askForConfirmation : ConfirmationID -> String -> Cmd msg
askForConfirmation id message =
    confirm ( encode id, message )


gotConfirmation : (( ConfirmationID, Bool ) -> msg) -> Sub msg
gotConfirmation msg =
    confirmations (msg << decode)


encode : ConfirmationID -> EncodedConfirmationID
encode (ConfirmationID id) =
    id


decode : ( EncodedConfirmationID, Bool ) -> ( ConfirmationID, Bool )
decode ( id, confirmed ) =
    ( ConfirmationID id, confirmed )
