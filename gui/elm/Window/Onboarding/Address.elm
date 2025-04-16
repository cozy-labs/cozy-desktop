module Window.Onboarding.Address exposing
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
import Window.Onboarding.Context as Context exposing (Context)



-- UPDATE


type Msg
    = FillAddress String
    | RegisterRemote
    | RegistrationError String


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

        RegisterRemote ->
            let
                addressConfig =
                    context.addressConfig

                address =
                    addressConfig.address
            in
            if address == "" then
                setError context "Address You don't have filled the address!"

            else if contains "@" address then
                setError context "Address No email address"

            else
                ( Context.setAddressConfig context { addressConfig | busy = True }
                , Ports.registerRemote addressConfig.address
                )

        RegistrationError error ->
            setError context error



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    div
        [ classList
            [ ( "step", True )
            , ( "step-address", True )
            , ( "step-error", context.addressConfig.error /= "" )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ Icons.cozyBig
            , h1 [] [ text (helpers.t "Address Please enter your Twake Workplace address") ]
            , if context.addressConfig.error == "" then
                p [ class "adress-helper" ]
                    [ text (helpers.t "Address This is the web address you use to sign in to your Twake Workplace.") ]

              else
                p [ class "error-message" ]
                    [ text (helpers.t context.addressConfig.error) ]
            , div [ class "coz-form-group" ]
                [ label [ class "coz-form-label" ]
                    [ text (helpers.t "Address Twake Workplace address") ]
                , div [ class "https-input-wrapper" ]
                    [ span [ class "address_https" ]
                        [ text "https://" ]
                    , input
                        [ placeholder "lucie.twake.app"
                        , classList
                            [ ( "wizard__address", True )
                            , ( "error", context.addressConfig.error /= "" )
                            ]
                        , type_ "text"
                        , value context.addressConfig.address
                        , disabled context.addressConfig.busy
                        , onInput FillAddress
                        , Keyboard.onEnter RegisterRemote
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
                [ class "c-btn c-btn--full u-mt-1"
                , href "#"
                , if context.addressConfig.address == "" then
                    attribute "disabled" "true"

                  else if context.addressConfig.busy then
                    attribute "aria-busy" "true"

                  else
                    onClick RegisterRemote
                ]
                [ span [] [ text (helpers.t "Address Next") ] ]
            ]
        ]
