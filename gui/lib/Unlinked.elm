module Unlinked exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- UPDATE


type Msg
    = Restart



-- VIEW


view : Helpers -> Html Msg
view helpers =
    section [ class "unlinked" ]
        [ div [ class "spacer" ] []
        , h1 [] [ text (helpers.t "Unlinked Your device has been unlinked") ]
        , p []
            [ text (helpers.t "Unlinked Your device is no longer registered on your Cozy.")
            , br [] []
            , text (helpers.t "Unlinked If you want to register it again, you can restart Cozy Drive.")
            , text " "
            , text (helpers.t "Unlinked Else, you can just close Cozy Drive.")
            ]
        , div [ class "spacer" ] []
        , a
            [ class "btn"
            , href "#"
            , onClick Restart
            ]
            [ text (helpers.t "Unlinked Restart Cozy Drive") ]
        ]
