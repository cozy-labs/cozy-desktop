module Address (..) where

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
        , ( "step-address", True )
        , ( "step-error", model.error /= Models.NoError )
        ]
    ]
    [ div
        [ class "upper" ]
        [ input
            [ placeholder "Cozy address"
            , value model.address
            , autofocus True
            , on "input" targetValue (\value -> Signal.message address (FillAddress value))
            ]
            []
        ]
    , p
        []
        [ text "This is the web address you use to sign in to your cozy." ]
    , a
        [ href "https://cozy.io/en/try-it/"
        , class "more-info"
        ]
        [ text "Don't have an account? Request one here" ]
    , a
        [ class "btn"
        , href "#"
        , onClick address GoToPasswordForm
        ]
        [ text "Next" ]
    ]
