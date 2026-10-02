module View.Logo exposing (view)

import Html exposing (..)
import Html.Attributes exposing (..)
import Icons



-- VIEW


view : Bool -> Html msg
view large =
    if large then
        div
            [ class "logo logo--large" ]
            [ Icons.twakeIcon 43
            , div [ class "logo__wordmark" ]
                [ span [] [ text "Twake" ]
                , span [] [ text "Workplace" ]
                ]
            ]

    else
        Icons.twakeWorkplaceLogo
