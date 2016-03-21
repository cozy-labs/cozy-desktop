module Address (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Actions exposing (Action)
import Models exposing (AppModel)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-address"
    , class "step"
    ]
    [ h2 [] [ text "Cozy address" ]
    , p [] [ text "This is the web address you use to sign in to your cozy." ]
    , button [] [ text "Next" ]
    ]
