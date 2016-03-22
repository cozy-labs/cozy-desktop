module Address (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Models exposing (AppModel)
import Update exposing (..)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-address"
    , class "step"
    ]
    [ input
        [ placeholder "Cozy address"
        , value model.address
        , on "input" targetValue (\value -> Signal.message address (FillAddress value))
        ]
        []
    , p [] [ text "This is the web address you use to sign in to your cozy." ]
    , a [ href "https://cozy.io/en/try-it/" ] [ text "Don't have an account? Request one here" ]
    , button [ onClick address GoToPasswordForm ] [ text "Next" ]
    ]
