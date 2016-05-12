module OnEnter exposing (..)

import Html
import Html.Events exposing (on, keyCode)
import Json.Decode as Json


onEnter : msg -> Html.Attribute msg
onEnter message =
    on "keydown"
        (Json.customDecoder keyCode (is13 message))


is13 : msg -> Int -> Result String msg
is13 message code =
    if code == 13 then
        Ok message
    else
        Err "not the right key code"
