module Welcome (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Models exposing (AppModel)
import Update exposing (..)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ classList
        [ ( "step", True )
        , ( "step-welcome", True )
        ]
    ]
    [ div
        [ class "upper" ]
        [ img [ src "images/happycloud.png" ] [] ]
    , h2 [] [ text "Your own private cloud" ]
    , a
        [ class "btn"
        , href "#"
        , onClick address GoToAddressForm
        ]
        [ text "Sign in to your Cozy" ]
    ]
