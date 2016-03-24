module Help (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


view : Html
view =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Help" ]
    , h2 [] [ text "Community Support" ]
    , ul
        []
        [ li
            []
            [ a [ href "https://forum.cozy.io/" ] [ text "Forum" ] ]
        , li
            []
            [ a [ href "https://webchat.freenode.net/?channels=cozycloud" ] [ text "IRC" ] ]
        , li
            []
            [ a [ href "https://github.com/cozy" ] [ text "Github" ] ]
        ]
    , h2 [] [ text "Official Support" ]
    , ul
        []
        [ li
            []
            [ a [ href "mailto:support@cozycloud.cc" ] [ text "Email" ] ]
        , li
            []
            [ a [ href "https://twitter.com/intent/tweet?text=@mycozycloud%20" ] [ text "Twitter" ] ]
        , li
            []
            [ a [ href "https://docs.cozy.io/en/" ] [ text "Documentation" ] ]
        ]
    ]
