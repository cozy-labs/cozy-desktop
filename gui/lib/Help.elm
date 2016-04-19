module Help (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
  { body : String
  }


init : Model
init =
  { body = """Hello Cozy,

I like a lot what you do, but I have an issue:

[ The more you can say about the issue, the better: do you have many files? Are they big? Is your cozy up-to-date? ]

Take care!
"""
  }



-- UPDATE


type Action
  = FillBody String


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillBody body' ->
      { model | body = body' }



-- VIEW


type alias Context =
  { actions : Signal.Address Action
  , sendMail : Signal.Address String
  }


view : Context -> Model -> Html
view context model =
  section
    [ class "two-panes__content two-panes__content--help" ]
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
    , p
        []
        [ text "You can send us feedback, report bugs and ask for assistance. "
        , text "We will get back to you as soon as possible."
        ]
    , Html.form
        [ class "send-mail-to-support" ]
        [ textarea
            [ on "input" targetValue (Signal.message context.actions << FillBody) ]
            [ text model.body ]
        , a
            [ class "btn btn--action"
            , href "#"
            , onClick context.sendMail model.body
            ]
            [ text "Send us a message" ]
        ]
    , p [] [ text "There are still a few more options to contact us:" ]
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
