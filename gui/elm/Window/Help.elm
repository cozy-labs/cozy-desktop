module Window.Help exposing
    ( Model
    , Msg(..)
    , Status(..)
    , bodyOrDefault
    , iconLink
    , init
    , subscriptions
    , update
    , view
    )

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers, Translate)
import List
import Ports
import String



-- MODEL


type Status
    = Writing
    | Sending
    | Error String
    | Success


type alias Model =
    { body : Maybe String
    , status : Status
    }


bodyOrDefault : Translate -> Model -> String
bodyOrDefault translate model =
    case
        model.body
    of
        Nothing ->
            String.join "\n\n"
                (List.map translate
                    [ "Help Hello Cozy,"
                    , "Help I like a lot what you do, but I have an issue:"
                    , "Help [ The more you can say about the issue, the better: do you have many files? Are they big? Is your cozy up-to-date? ]"
                    , "Help Take care!"
                    ]
                )

        Just body ->
            body


init : Model
init =
    { body = Nothing
    , status = Writing
    }



-- UPDATE


type Msg
    = FillBody String
    | SendMail Translate
    | MailSent (Maybe String)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillBody body ->
            ( { model | body = Just body, status = Writing }, Cmd.none )

        SendMail translate ->
            ( { model | status = Sending }
            , Ports.sendMail (bodyOrDefault translate model)
            )

        MailSent Nothing ->
            ( { model | status = Success }, Cmd.none )

        MailSent (Just error) ->
            ( { model | status = Error error }, Cmd.none )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    Ports.mail MailSent



-- VIEW


iconLink : Helpers -> String -> String -> String -> Html Msg
iconLink helpers linkHref iconName label =
    li []
        [ a [ href linkHref ]
            [ i [ class ("icon icon--" ++ iconName) ] []
            , text (helpers.t label)
            ]
        ]


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "two-panes__content two-panes__content--help" ]
        [ h1 [] [ text (helpers.t "Help Help") ]
        , if model.status == Success then
            p [ class "message--success" ]
                [ text (helpers.t "Help Your mail has been sent. We will try to respond to it really soon!") ]

          else
            Html.form [ class "send-mail-to-support" ]
                [ case model.status of
                    Error error ->
                        p [ class "message--error" ]
                            [ text (helpers.t error) ]

                    _ ->
                        p []
                            [ text (helpers.t "Help You can send us feedback, report bugs and ask for assistance.")
                            , text " "
                            , text (helpers.t "Help We will get back to you as soon as possible.")
                            , text (helpers.t "Help Multi Computer")
                            ]
                , textarea [ onInput FillBody ] [ text (bodyOrDefault helpers.t model) ]
                , a
                    [ class "btn btn--msg"
                    , href "#"
                    , if model.status == Sending then
                        attribute "aria-busy" "true"

                      else
                        onClick (SendMail helpers.t)
                    ]
                    [ span [] [ text (helpers.t "Help Send us a message") ] ]
                ]
        ]
