module Util.Mouse exposing (EventWithKeys, onCapturingClick, onSpecialClick)

import Html
import Html.Events
import Html.Events.Extra.Mouse as Mouse
import Json.Decode as Decode exposing (Decoder)


type alias Keys =
    { alt : Bool, ctrl : Bool, meta : Bool, shift : Bool }


type alias EventOptions =
    { stopPropagation : Bool, preventDefault : Bool }


type alias EventWithKeys =
    { mouseEvent : Mouse.Event
    , keys : Keys
    }


decodeWithKeys : Decoder EventWithKeys
decodeWithKeys =
    Decode.map2 EventWithKeys
        Mouse.eventDecoder
        keysDecoder



-- Decodes ctrl or cmd/meta key as ctrl


keysDecoder : Decoder Keys
keysDecoder =
    Decode.map4 Keys
        (Decode.field "altKey" Decode.bool)
        (Decode.field "ctrlKey" Decode.bool)
        (Decode.field "metaKey" Decode.bool)
        (Decode.field "shiftKey" Decode.bool)


onClickWithOptions : EventOptions -> (EventWithKeys -> msg) -> Html.Attribute msg
onClickWithOptions { stopPropagation, preventDefault } htmlTag =
    let
        decoder =
            decodeWithKeys
                |> Decode.map htmlTag
                |> Decode.map options

        options message =
            { message = message
            , stopPropagation = stopPropagation
            , preventDefault = preventDefault
            }
    in
    Html.Events.custom "click" decoder


onSpecialClick : (EventWithKeys -> msg) -> Html.Attribute msg
onSpecialClick =
    onClickWithOptions { stopPropagation = False, preventDefault = True }


onCapturingClick : (EventWithKeys -> msg) -> Html.Attribute msg
onCapturingClick =
    onClickWithOptions { stopPropagation = True, preventDefault = False }
