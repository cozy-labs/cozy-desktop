port module Data.ClientCertificate exposing (ClientCertificate, SerialNumber, emptySerialNumber, gotCertificates, newSerialNumber, serial, validateSelection)

import Json.Decode as Json exposing (..)



-- Careful! To be sure to match the selected certificate with the received
-- list, you need to use the same SerialNumber in validateSelection than the
-- one received from gotCertificates.
--
-- e.g.
--   serialNumber = SerialNumber "1622143EC4D515BFCB5D1070419DAF4A42FC4AB0"
--
--   gotCertificates ("https://localhost:5000", { subjectName: "Client", issuerName: "Root CA", serialNumber: serialNumber })
--   validateSelection serialNumber


type alias ClientCertificate =
    { subjectName : String
    , issuerName : String
    , serialNumber : SerialNumber
    }


type SerialNumber
    = SerialNumber String


newSerialNumber : String -> SerialNumber
newSerialNumber serialNumber =
    SerialNumber serialNumber


emptySerialNumber : SerialNumber
emptySerialNumber =
    SerialNumber ""


serial : SerialNumber -> String
serial (SerialNumber serialNumber) =
    serialNumber



-- Ports


type alias ClientCertificateRequest =
    { siteUrl : Maybe String
    , certificates : Maybe (List ClientCertificate)
    }


port selectClientCertificate : String -> Cmd msg


port clientCertificates : (Json.Value -> msg) -> Sub msg


validateSelection : SerialNumber -> Cmd msg
validateSelection serialNumber =
    selectClientCertificate (encodeSerialNumber serialNumber)


gotCertificates : (( String, List ClientCertificate ) -> msg) -> Sub msg
gotCertificates msg =
    clientCertificates (msg << decodeMsg)


decodeMsg : Json.Value -> ( String, List ClientCertificate )
decodeMsg json =
    case decodeValue decoder json of
        Ok { siteUrl, certificates } ->
            ( Maybe.withDefault "" siteUrl
            , Maybe.withDefault [] certificates
            )

        Err _ ->
            ( "", [] )


decoder : Decoder ClientCertificateRequest
decoder =
    map2 ClientCertificateRequest
        (at [ "siteUrl" ] (maybe string))
        (at [ "certificates" ] (maybe (list certificateDecoder)))


certificateDecoder : Decoder ClientCertificate
certificateDecoder =
    map3 ClientCertificate
        (at [ "subjectName" ] string)
        (at [ "issuerName" ] string)
        (at [ "serialNumber" ] (map SerialNumber string))


encodeSerialNumber : SerialNumber -> String
encodeSerialNumber (SerialNumber serialNumber) =
    serialNumber
