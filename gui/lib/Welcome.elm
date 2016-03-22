module Welcome (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Models exposing (AppModel)
import Update exposing (..)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-welcome"
    , class "step"
    ]
    [ img [ src "images/icon.png" ] []
    , h2 [] [ text "Your own private cloud" ]
    , button [ onClick address GoToAddressForm ] [ text "Sign in to your Cozy" ]
    ]
