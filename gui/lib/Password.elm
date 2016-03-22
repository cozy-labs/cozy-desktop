module Password (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Models exposing (AppModel)
import Update exposing (..)


view : Signal.Address Action -> AppModel -> Html
view address model =
  div
    [ id "step-password"
    , class "step"
    ]
    [ a
        [ class "back"
        , href "#address"
        , onClick address GoToAddressForm
        ]
        [ text "←" ]
    , input
        [ placeholder "Password"
        , type' "password"
        , value model.password
        , on "input" targetValue (\value -> Signal.message address (FillPassword value))
        ]
        []
    , p
        []
        [ text "Your password for the cozy address: "
        , em [] [ text model.address ]
        ]
    , button [ onClick address AddDevice ] [ text "Login" ]
    ]
