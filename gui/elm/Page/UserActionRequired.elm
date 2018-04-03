module Page.UserActionRequired exposing (view)

import Html exposing (..)
import Html.Attributes exposing (..)
import Model exposing (UserActionRequiredError)


view : UserActionRequiredError -> Html msg
view { title, details, links } =
    div []
        [ h2 [] [ text title ]
        , p [] [ text details ]
        , a [ href links.action ] [ text "Procéder" ]
        ]
