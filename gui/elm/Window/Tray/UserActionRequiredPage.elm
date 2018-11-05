module Window.Tray.UserActionRequiredPage exposing (view)

import Data.UserActionRequiredError exposing (UserActionRequiredError)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Locale exposing (Helpers)


include_GDPR_link : String -> String -> List (Html msg)
include_GDPR_link base_text url =
    List.intersperse (a [ href url ] [ text "GDPR" ])
        (List.map text (String.split "GDPR" base_text))


view : Helpers -> UserActionRequiredError -> msg -> Html msg
view helpers { code, title, detail, links } msg =
    div [ class "two-panes two-panes__content user-action-required" ]
        -- Same logic as gui/js/components/UserActionRequiredDialog.js
        (if code == "tos-updated" then
            [ img [ class "error_img", src "images/tos_updated.svg" ] []
            , h2 [] [ text (helpers.t "CGU Updated") ]
            , p [] (include_GDPR_link (helpers.t "CGU Updated Detail") (helpers.t "CGU GDPR Link"))
            , p []
                [ strong [] [ text (helpers.t "CGU Updated Required strong") ]
                , text " "
                , text (helpers.t "CGU Updated Required rest")
                ]
            , a [ class "btn", href links.self, onClick msg ]
                [ text (helpers.t "CGU Updated See") ]
            ]

         else
            [ h2 [] [ text title ]
            , p [] [ text detail ]
            , a [ class "btn", href links.self, onClick msg ]
                [ text (helpers.t "Error Ok") ]
            ]
        )
