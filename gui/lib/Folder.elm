module Folder (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Models exposing (AppModel)
import Update exposing (..)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-folder"
    , class "step"
    ]
    [ h2 [] [ text "All done" ]
    , p [] [ text "Select a location for your Cozy folder:" ]
    , input
        [ value model.folder
        , on "input" targetValue (\value -> Signal.message address (FillFolder value))
        ]
        []
    , button [ onClick address StartSync ] [ text "Use Cozy Desktop" ]
    ]
