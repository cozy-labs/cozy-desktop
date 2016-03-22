module Password (..) where

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
        , ( "step-password", True )
        , ( "step-error", model.error /= Models.NoError )
        ]
    ]
    [ div
        [ class "upper" ]
        [ input
            [ placeholder "Password"
            , type' "password"
            , value model.password
            , autofocus True
            , on "input" targetValue (\value -> Signal.message address (FillPassword value))
            ]
            []
        ]
    , p
        []
        [ text "Your password for the cozy address: "
        , em [] [ text model.address ]
        ]
    , a
        [ href "#"
        , class "more-info"
        , onClick address GoToAddressForm
        ]
        [ text "Wrong cozy address ?" ]
    , a
        [ class "btn"
        , href "#"
        , onClick address AddDevice
        ]
        [ text "Login" ]
    ]
