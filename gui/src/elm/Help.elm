port module Help exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List
import String
import Helpers exposing (Helpers)


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


bodyOrDefault : Model -> String
bodyOrDefault model =
    case
        model.body
    of
        Nothing ->
            String.join "\n\n"
                [ "Help Hello Cozy,"
                , "Help I like a lot what you do, but I have an issue:"
                , "Help [ The more you can say about the issue, the better: do you have many files? Are they big? Is your cozy up-to-date? ]"
                , "Help Take care!"
                ]

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
    | SendMail
    | MailSent (Maybe String)


port sendMail : String -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillBody body ->
            ( { model | body = Just body, status = Writing }, Cmd.none )

        SendMail ->
            ( { model | status = Sending }, sendMail (bodyOrDefault model) )

        MailSent Nothing ->
            ( { model | status = Success }, Cmd.none )

        MailSent (Just error) ->
            ( { model | status = (Error error) }, Cmd.none )



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
        , h2 [] [ text (helpers.t "Help Community Support") ]
        , p [] [ text (helpers.t "Help Our community grows everyday and will be happy to give you an helping hand in one of these media:") ]
        , ul [ class "help-list" ]
            [ (iconLink helpers "https://forum.cozy.io/" "forum" "Help Forum")
            , (iconLink helpers "https://webchat.freenode.net/?channels=cozycloud" "irc" "Help IRC")
            , (iconLink helpers "https://github.com/cozy" "github" "Help Github")
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
                , textarea [ onInput FillBody ] [ text (bodyOrDefault model) ]
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
            [ (iconLink helpers "mailto:support@cozycloud.cc" "email" "Help Email")
            , (iconLink helpers "https://twitter.com/intent/tweet?text=@mycozycloud%20" "twitter" "Help Twitter")
            , (iconLink helpers "https://docs.cozy.io/en/" "documentation" "Help Documentation")
            ]
        ]
