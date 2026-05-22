port module Window.Onboarding.Address exposing
    ( Msg(..)
    , correctAddress
    , dropAppName
    , setError
    , update
    , view
    )

import Data.AddressConfig as AddressConfig exposing (AddressConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Ports
import String exposing (contains)
import Url
import Util.Keyboard as Keyboard
import View.BackButton as BackButton
import Window.Onboarding.Context as Context exposing (Context)



-- UPDATE


type Msg
    = FillAddress String
    | RegisterWithURL
    | RegistrationError String
    | LoginWithCustomServer
    | GoToWelcome


coreAppNames : List String
coreAppNames =
    [ "drive", "photos", "banks", "settings", "home", "contacts", "mespapiers", "notes", "passwords", "store" ]


containsCoreAppName : String -> Bool
containsCoreAppName address =
    List.any (\appName -> contains appName address) coreAppNames


setError : Context -> String -> ( Context, Cmd msg )
setError context message =
    ( Context.setAddressConfig context (AddressConfig.setError context.addressConfig message)
    , Ports.focus ".wizard__address"
    )


dropAppName : String -> String
dropAppName address =
    let
        cleanInstanceName =
            \name ->
                List.foldl
                    (\appName cleanName ->
                        if cleanName == appName then
                            ""

                        else
                            String.replace ("-" ++ appName) "" cleanName
                    )
                    name
                    coreAppNames

        cleanParts =
            case String.split "." address of
                [] ->
                    -- This can't happen because String.split always return a
                    -- list with at least one element but is required by Elm.
                    [ address, "mycozy.cloud" ]

                [ instance ] ->
                    -- This should never happen as we already append
                    -- `.mycozy.cloud` to addresses without host
                    [ address, "mycozy.cloud" ]

                instance :: rest ->
                    cleanInstanceName instance :: rest
    in
    if String.isEmpty address then
        ""

    else
        cleanParts
            |> List.filter (\part -> not (String.isEmpty part))
            |> String.join "."


correctAddress : String -> String
correctAddress address =
    let
        { protocol, host, port_, path } =
            case Url.fromString address of
                Just url ->
                    url

                Nothing ->
                    Url.Url Url.Https address Nothing "" Nothing Nothing

        prependProtocol =
            if protocol == Url.Http || port_ == Just 80 then
                (++) "http://"

            else
                identity

        appendPort shortAddress =
            case ( protocol, port_ ) of
                ( Url.Http, Just 80 ) ->
                    shortAddress

                ( Url.Https, Just 443 ) ->
                    shortAddress

                ( _, Nothing ) ->
                    shortAddress

                ( _, Just p ) ->
                    shortAddress ++ ":" ++ String.fromInt p
    in
    host
        |> dropAppName
        |> prependProtocol
        |> appendPort


update : Msg -> Context -> ( Context, Cmd msg )
update msg context =
    case
        msg
    of
        FillAddress address ->
            ( Context.setAddressConfig context { address = address, error = "", busy = False }, Cmd.none )

        RegisterWithURL ->
            let
                addressConfig =
                    context.addressConfig

                address =
                    addressConfig.address
            in
            if address == "" then
                setError context "Address You haven't filled the address!"

            else if contains "@" address then
                setError context "Address No email address"

            else
                ( Context.setAddressConfig context { addressConfig | busy = True }
                , registerWithURL addressConfig.address
                )

        RegistrationError error ->
            setError context error

        LoginWithCustomServer ->
            reset context

        GoToWelcome ->
            reset context


reset : Context -> ( Context, Cmd msg )
reset context =
    ( Context.setAddressConfig context { address = "", error = "", busy = False }
    , Cmd.none
    )


port registerWithURL : String -> Cmd msg



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    let
        error =
            context.addressConfig.error

        isValid =
            error == ""
    in
    div
        [ classList
            [ ( "step", True )
            , ( "step-address", True )
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
            , h1 [] [ text (helpers.t "Address Sign in") ]
            , if isValid then
                p [ class "adress-helper" ]
                    [ text (helpers.t "Address To sign in and access your Twake Workplace, please enter its URL.") ]

              else
                p [ class "error-message" ]
                    [ text (helpers.t error) ]
            , div [ class "coz-form-group" ]
                [ label [ class "coz-form-label" ]
                    [ text (helpers.t "Address Twake Workplace address") ]
                , div [ class "input-wrapper" ]
                    [ span [ class "address_https" ]
                        [ text "https://" ]
                    , input
                        [ placeholder "claude.twake.app"
                        , classList
                            [ ( "wizard__address", True )
                            , ( "error", not isValid )
                            ]
                        , type_ "text"
                        , value context.addressConfig.address
                        , disabled context.addressConfig.busy
                        , onInput FillAddress
                        , Keyboard.onEnter RegisterWithURL
                        ]
                        []
                    ]
                ]
            , div [ class "cozy-form-tip" ]
                [ text (helpers.t "Address Example Before")
                , strong [] [ text (helpers.t "Address Example Bold") ]
                , text (helpers.t "Address Example After")
                ]
            , a
                [ class "more-info"
                , href "#"
                , onClick LoginWithCustomServer
                ]
                [ span [] [ text (helpers.t "Address Enter my organization email") ] ]
            , a
                [ class "c-btn c-btn--full u-mt-1"
                , href "#"
                , if context.addressConfig.address == "" then
                    attribute "disabled" "true"

                  else if context.addressConfig.busy then
                    attribute "aria-busy" "true"

                  else
                    onClick RegisterWithURL
                ]
                [ span [] [ text (helpers.t "Address Next") ] ]
            ]
        ]
