module Util.Keyboard exposing (onEnter)

import Html
import Html.Events exposing (keyCode, on)
import Json.Decode as Json


onEnter : msg -> Html.Attribute msg
onEnter message =
    on "keydown"
        (keyCode
            |> Json.andThen (is13 message)
        )


is13 : msg -> Int -> Json.Decoder msg
is13 message code =
    if code == 13 then
        Json.succeed message

    else
        Json.fail "not the right key code"
