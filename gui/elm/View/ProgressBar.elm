module View.ProgressBar exposing (view)

import Html exposing (..)
import Html.Attributes exposing (..)


view : Float -> Html msg
view ratio =
    let
        cappedRatio =
            Basics.min 1 ratio

        percent =
            String.fromFloat (cappedRatio * 100) ++ "%"
    in
    div [ class "progress" ]
        [ div
            [ class "progress-inner"
            , style "width" percent
            ]
            []
        ]
