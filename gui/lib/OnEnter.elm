module OnEnter (..) where

import Html
import Html.Events exposing (on, keyCode)
import Json.Decode as Json


onEnter : Signal.Address a -> a -> Html.Attribute
onEnter address value =
  on
    "keydown"
    (Json.customDecoder keyCode is13)
    (\_ -> Signal.message address value)


is13 : Int -> Result String ()
is13 code =
  if code == 13 then
    Ok ()
  else
    Err "not the right key code"
