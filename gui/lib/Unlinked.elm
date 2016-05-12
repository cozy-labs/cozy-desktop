module Unlinked exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- UPDATE


type Msg
    = Restart



-- VIEW


view : Html Msg
view =
    section [ class "unlinked" ]
        [ div [ class "spacer" ] []
        , h1 [] [ text "Your device has been unlinked" ]
        , p []
            [ text "Your device is no longer registered on your Cozy."
            , br [] []
            , text "If you want to register it again, you can restart Cozy-desktop. "
            , text "Else, you can just close Cozy-desktop."
            ]
        , div [ class "spacer" ] []
        , a
            [ class "btn"
            , href "#"
            , onClick Restart
            ]
            [ text "Restart Cozy-desktop" ]
        ]
