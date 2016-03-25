module Settings (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


view : String -> Html
view version =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Settings" ]
    , h2 [] [ text "Version" ]
    , p
        []
        [ text ("Cozy-Desktop " ++ version)
        , br [] []
        , a
            [ href "https://github.com/cozy-labs/cozy-desktop" ]
            [ text "Github Page" ]
        ]
    ]
