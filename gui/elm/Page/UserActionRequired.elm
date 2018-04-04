module Page.UserActionRequired exposing (view)

import Html exposing (..)
import Html.Attributes exposing (..)
import Model exposing (UserActionRequiredError)
import Helpers exposing (Helpers)


include_GDPR_link : String -> String -> List (Html msg)
include_GDPR_link base_text url =
    List.intersperse (a [ href url ] [ text "GDPR" ])
        (List.map text (String.split "GDPR" base_text))


view : Helpers -> UserActionRequiredError -> Html msg
view helpers { error, title, details, links } =
    div [ class "two-panes two-panes__content user-action-required" ]
        (if error == "tos_updated" then
            [ img [ class "error_img", src "images/tos_updated.svg" ] []
            , h2 [] [ text (helpers.t "CGU Updated") ]
            , p [] (include_GDPR_link (helpers.t "CGU Updated Detail") (helpers.t "CGU GDPR Link"))
            , p []
                [ strong [] [ text (helpers.t "CGU Updated Required strong") ]
                , text " "
                , text (helpers.t "CGU Updated Required rest")
                ]
            , a [ class "btn", href links.action ] [ text (helpers.t "CGU Updated See") ]
            ]
         else
            [ h2 [] [ text title ]
            , p [] [ text details ]
            , a [ class "btn", href links.action ] [ text "Procéder" ]
            ]
        )
