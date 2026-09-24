port module Window.Onboarding.OAuth exposing
    ( Msg(..)
    , informAndLogin
    , setError
    , setOIDCLoginURL
    , startLogin
    , update
    , view
    )

import Data.OAuthConfig as OAuthConfig exposing (OAuthConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Ports
import Process
import Task
import Time
import Window.Onboarding.Context as Context exposing (Context)



-- UPDATE


type Msg
    = StartOAuth
    | SetOIDCLoginURL String
    | OAuthError String
    | OpenBrowser
    | Tick Time.Posix


update : Msg -> Context -> ( Context, Cmd msg )
update msg context =
    case msg of
        StartOAuth ->
            startLogin context

        SetOIDCLoginURL oidcLoginUrl ->
            ( setOIDCLoginURL oidcLoginUrl context, Cmd.none )

        OAuthError error ->
            setError error context

        OpenBrowser ->
            if context.oauthConfig.browserOpened then
                ( context, Cmd.none )

            else
                startLogin context

        Tick now ->
            let
                { oauthConfig } =
                    context
            in
            ( Context.setOAuthConfig context { oauthConfig | busy = False }, Cmd.none )


informAndLogin : Context -> ( Context, Cmd Msg )
informAndLogin context =
    ( context
    , Process.sleep openBrowserDelay
        |> Task.perform (always OpenBrowser)
    )


openBrowserDelay : Float
openBrowserDelay =
    5000


startLogin : Context -> ( Context, Cmd msg )
startLogin context =
    let
        { oauthConfig } =
            context
    in
    ( Context.setOAuthConfig context { oauthConfig | busy = True, browserOpened = True }
    , startOAuth oauthConfig.oidcLoginURL
    )


setOIDCLoginURL : String -> Context -> Context
setOIDCLoginURL url context =
    let
        oauthConfig =
            OAuthConfig.setOIDCLoginURL context.oauthConfig url
    in
    Context.setOAuthConfig context oauthConfig


setError : String -> Context -> ( Context, Cmd msg )
setError message context =
    let
        oauthConfig =
            OAuthConfig.setError context.oauthConfig message
    in
    ( Context.setOAuthConfig context oauthConfig
    , Cmd.none
    )


port startOAuth : Maybe String -> Cmd msg



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    let
        error =
            context.oauthConfig.error

        isValid =
            error == ""

        informing =
            isValid && not context.oauthConfig.browserOpened

        content =
            if informing then
                [ Icons.badge Icons.twakeDrive
                , h1 [] [ text (helpers.t "OAuth Login in your browser") ]
                , p []
                    [ text (helpers.t "OAuth Your login page will open in your default browser in a few seconds.") ]
                , a
                    [ class "c-btn c-btn--full u-mt-1"
                    , href "#"
                    , onClick OpenBrowser
                    ]
                    [ span [] [ text (helpers.t "OAuth Open my browser now") ] ]
                ]

            else
                [ if isValid then
                    Icons.badge Icons.twakeDrive

                  else
                    Icons.bigCross
                , h1 [] [ text (helpers.t "OAuth Waiting for login") ]
                , if isValid then
                    p []
                        [ text (helpers.t "OAuth Please check your default browser and log in your Twake account.")
                        , text (helpers.t "OAuth You'll be redirected here once it's done.")
                        ]

                  else
                    p [ class "error-message" ]
                        [ text (helpers.t error) ]
                , p []
                    [ text (helpers.t "OAuth If something went wrong, you can retry the login by clicking on the button below.") ]
                , a
                    [ class "c-btn c-btn--full u-mt-1"
                    , href "#"
                    , if context.oauthConfig.busy then
                        attribute "aria-busy" "true"

                      else
                        onClick StartOAuth
                    ]
                    [ span [] [ text (helpers.t "OAuth Retry") ] ]
                , a
                    [ class "more-info"
                    , href "mailto:support@twake.app"
                    ]
                    [ text (helpers.t "OAuth Contact support") ]
                ]
    in
    div
        [ classList
            [ ( "step", True )
            , ( "step-oauth", True )
            , ( "step-error", not isValid )
            ]
        ]
        [ div
            [ class "step-content" ]
            content
        ]
