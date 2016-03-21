module Welcome (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Actions exposing (Action)
import Models exposing (AppModel)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-welcome"
    , class "step"
    ]
    [ img [ src "images/icon.png" ] []
    , h2 [] [ text "Your own private cloud" ]
    , button [ onClick address Actions.NextStep ] [ text "Sign in to your Cozy" ]
    ]
