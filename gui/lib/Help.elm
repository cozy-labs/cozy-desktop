port module Help exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type Status
    = Writing
    | Sending
    | Error String
    | Success


type alias Model =
    { body : String
    , status : Status
    }


init : Model
init =
    { body = """Hello Cozy,

I like a lot what you do, but I have an issue:

[ The more you can say about the issue, the better: do you have many files? Are they big? Is your cozy up-to-date? ]

Take care!
"""
    , status = Writing
    }



-- UPDATE


type Msg
    = FillBody String
    | SendMail
    | MailSent (Maybe String)


port sendMail : String -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillBody body' ->
            ( { model | body = body', status = Writing }, Cmd.none )

        SendMail ->
            ( { model | status = Sending }, sendMail model.body )

        MailSent Nothing ->
            ( { model | status = Success }, Cmd.none )

        MailSent (Just error) ->
            ( { model | status = (Error error) }, Cmd.none )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "two-panes__content two-panes__content--help" ]
        [ h1 [] [ text (helpers.t "Help Help") ]
        , h2 [] [ text (helpers.t "Help Community Support") ]
        , p [] [ text (helpers.t "Help Our community grows everyday and will be happy to give you an helping hand in one of these media:") ]
        , ul [ class "help-list" ]
            [ li []
                [ a [ href "https://forum.cozy.io/" ]
                    [ i [ class "icon icon--forum" ] []
                    , text (helpers.t "Help Forum")
                    ]
                ]
            , li []
                [ a [ href "https://webchat.freenode.net/?channels=cozycloud" ]
                    [ i [ class "icon icon--irc" ] []
                    , text (helpers.t "Help IRC")
                    ]
                ]
            , li []
                [ a [ href "https://github.com/cozy" ]
                    [ i [ class "icon icon--github" ] []
                    , text (helpers.t "Help Github")
                    ]
                ]
            ]
        , h2 [] [ text (helpers.t "Help Official Support") ]
        , if model.status == Success then
            p [ class "message--success" ]
                [ text (helpers.t "Help Your mail has been sent. We will try to respond to it really soon!") ]
          else
            Html.form [ class "send-mail-to-support" ]
                [ case model.status of
                    Error error ->
                        p [ class "message--error" ]
                            [ text ("Error: " ++ error) ]

                    _ ->
                        p []
                            [ text (helpers.t "Help You can send us feedback, report bugs and ask for assistance.")
                            , text " "
                            , text (helpers.t "Help We will get back to you as soon as possible.")
                            ]
                , textarea [ onInput FillBody ]
                    [ text model.body ]
                , a
                    [ class "btn btn--msg"
                    , href "#"
                    , if model.status == Sending then
                        attribute "aria-busy" "true"
                      else
                        onClick SendMail
                    ]
                    [ text (helpers.t "Help Send us a message") ]
                ]
        , p [] [ text (helpers.t "Help There are still a few more options to contact us:") ]
        , ul [ class "help-list" ]
            [ li []
                [ a [ href "mailto:support@cozycloud.cc" ]
                    [ i [ class "icon icon--email" ] []
                    , text (helpers.t "Help Email")
                    ]
                ]
            , li []
                [ a [ href "https://twitter.com/intent/tweet?text=@mycozycloud%20" ]
                    [ i [ class "icon icon--twitter" ] []
                    , text (helpers.t "Help Twitter")
                    ]
                ]
            , li []
                [ a [ href "https://docs.cozy.io/en/" ]
                    [ i [ class "icon icon--documentation" ] []
                    , text (helpers.t "Help Documentation")
                    ]
                ]
            ]
        ]
