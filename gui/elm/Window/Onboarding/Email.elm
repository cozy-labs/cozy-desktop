port module Window.Onboarding.Email exposing
    ( Msg(..)
    , setError
    , update
    , view
    )

import Data.EmailConfig as EmailConfig exposing (EmailConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Ports
import String exposing (contains)
import Util.Keyboard as Keyboard
import View.BackButton as BackButton
import Window.Onboarding.Context as Context exposing (Context)
import Window.Onboarding.Welcome as Welcome



-- UPDATE


type Msg
    = FillAddress String
    | RegisterWithEmail
    | RegistrationError String
    | LoginWithAddress
    | GoToWelcome


setError : Context -> String -> ( Context, Cmd msg )
setError context message =
    ( Context.setEmailConfig context (EmailConfig.setError context.emailConfig message)
    , Ports.focus ".wizard__address"
    )


update : Msg -> Context -> ( Context, Cmd msg )
update msg context =
    case
        msg
    of
        FillAddress address ->
            ( Context.setEmailConfig context { address = address, error = "", busy = False }, Cmd.none )

        RegisterWithEmail ->
            let
                emailConfig =
                    context.emailConfig

                address =
                    emailConfig.address
            in
            if address == "" then
                setError context "Email You haven't filled the address!"

            else if not (contains "@" address) then
                setError context "Email Not an email address"

            else
                ( Context.setEmailConfig context { emailConfig | busy = True }
                , registerWithEmail emailConfig.address
                )

        RegistrationError error ->
            setError context error

        LoginWithAddress ->
            reset context

        GoToWelcome ->
            reset context


reset : Context -> ( Context, Cmd msg )
reset context =
    ( Context.setEmailConfig context { address = "", error = "", busy = False }
    , Cmd.none
    )


port registerWithEmail : String -> Cmd msg



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    let
        error =
            context.emailConfig.error

        isValid =
            error == ""
    in
    div
        [ classList
            [ ( "step", True )
            , ( "step-email", True )
            , ( "step-error", not isValid )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ div
                [ class "u-pos-absolute u-top-xs u-left-xs" ]
                [ BackButton.view helpers GoToWelcome
                ]
            , if isValid then
                Icons.badge Icons.twakeDrive

              else
                Icons.bigCross
            , h1 [] [ text (helpers.t "Email Sign in") ]
            , if isValid then
                p [ class "adress-helper" ]
                    [ text (helpers.t "Email To sign in and access your Twake Workplace, please enter your organization email address.") ]

              else
                p [ class "error-message" ]
                    [ text (helpers.t error) ]
            , div [ class "coz-form-group" ]
                [ label [ class "coz-form-label" ]
                    [ text (helpers.t "Email") ]
                , div [ class "input-wrapper" ]
                    [ input
                        [ placeholder "Enter your organization email"
                        , classList
                            [ ( "wizard__address", True )
                            , ( "error", not isValid )
                            ]
                        , type_ "text"
                        , value context.emailConfig.address
                        , disabled context.emailConfig.busy
                        , onInput FillAddress
                        , Keyboard.onEnter RegisterWithEmail
                        ]
                        []
                    ]
                ]
            , div [ class "cozy-form-tip" ]
                [ text (helpers.t "Email Example") ]
            , a
                [ class "more-info"
                , href "#"
                , onClick LoginWithAddress
                ]
                [ span [] [ text (helpers.t "Email Enter my Twake URL") ] ]
            , a
                [ class "c-btn c-btn--full u-mt-1"
                , href "#"
                , if context.emailConfig.address == "" then
                    attribute "disabled" "true"

                  else if context.emailConfig.busy then
                    attribute "aria-busy" "true"

                  else
                    onClick RegisterWithEmail
                ]
                [ span [] [ text (helpers.t "Email Next") ] ]
            ]
        ]
