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
    , p [] [ text "Our community grows everyday and will be happy to give you an helping hand in one of these media:" ]
    , ul
        [ class "help-list" ]
        [ li
            []
            [ a
                [ href "https://forum.cozy.io/" ]
                [ i [ class "icon icon--forum" ] []
                , text "Forum"
                ]
            ]
        , li
            []
            [ a
                [ href "https://webchat.freenode.net/?channels=cozycloud" ]
                [ i [ class "icon icon--irc" ] []
                , text "IRC"
                ]
            ]
        , li
            []
            [ a
                [ href "https://github.com/cozy" ]
                [ i [ class "icon icon--github" ] []
                , text "Github"
                ]
            ]
        ]
    , h2 [] [ text "Official Support" ]
    , p [] [ text "You can send us feedback, report bugs and ask for assistance:" ]
    , ul
        [ class "help-list" ]
        [ li
            []
            [ a
                [ href "mailto:support@cozycloud.cc" ]
                [ i [ class "icon icon--email" ] []
                , text "Email"
                ]
            ]
        , li
            []
            [ a
                [ href "https://twitter.com/intent/tweet?text=@mycozycloud%20" ]
                [ i [ class "icon icon--twitter" ] []
                , text "Twitter"
                ]
            ]
        , li
            []
            [ a
                [ href "https://docs.cozy.io/en/" ]
                [ i [ class "icon icon--documentation" ] []
                , text "Documentation"
                ]
            ]
        ]
    ]
