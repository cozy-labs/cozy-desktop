module Window.Onboarding.Address exposing (Model, Msg(..), correctAddress, dropAppName, init, setError, update, view)

import Erl
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Locale exposing (Helpers)
import Ports
import String exposing (contains)
import Util.Keyboard as Keyboard



-- MODEL


type alias Model =
    { address : String
    , error : String
    , busy : Bool
    }


init : Model
init =
    { address = ""
    , error = ""
    , busy = False
    }



-- UPDATE


type Msg
    = FillAddress String
    | RegisterRemote
    | RegistrationError String
    | CorrectAddress


setError : Model -> String -> ( Model, Cmd msg )
setError model message =
    ( { model | error = message, busy = False }
    , Ports.focus ".wizard__address"
    )


dropAppName : String -> String
dropAppName address =
    if String.endsWith ".mycozy.cloud" address then
        case String.split "-" address of
            [] ->
                ""

            [ wholeaddress ] ->
                wholeaddress

            instanceName :: _ ->
                instanceName ++ ".mycozy.cloud"

    else if not (String.contains "." address) then
        address ++ ".mycozy.cloud"

    else
        address


correctAddress : String -> String
correctAddress address =
    let
        { protocol, host, port_, path } =
            Erl.parse address

        -- Erl assumes "camillenimbus" is a path, not a host
        handleInstanceShortName host =
            if host == [ "" ] then
                path
            else
                host

        prependProtocol =
            if protocol == "http" || port_ == 80 then
                (++) "http://"
            else
                identity

        appendPort address =
            case ( protocol, port_ ) of
                ( "http", 80 ) ->
                    address

                ( "https", 443 ) ->
                    address

                ( "", 0 ) ->
                    address

                _ ->
                    address ++ ":" ++ (toString port_)
    in
        host
            |> handleInstanceShortName
            |> String.join "."
            |> dropAppName
            |> prependProtocol
            |> appendPort


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillAddress address ->
            ( { model | address = address, error = "", busy = False }, Cmd.none )

        CorrectAddress ->
            ( { model | address = correctAddress model.address }, Cmd.none )

        RegisterRemote ->
            if model.address == "" then
                setError model "Address You don't have filled the address!"

            else if contains "@" model.address then
                setError model "Address No email address"

            else if contains "mycosy.cloud" model.address then
                setError model "Address Cozy not cosy"

            else
                ( { model | busy = True, address = correctAddress model.address }
                , Ports.registerRemote (correctAddress model.address)
                )

        RegistrationError error ->
            setError model error



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    div
        [ classList
            [ ( "step", True )
            , ( "step-address", True )
            , ( "step-error", model.error /= "" )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ Icons.cozyBig
            , h1 [] [ text (helpers.t "Address Please introduce your cozy address") ]
            , if model.error == "" then
                p [ class "adress-helper" ]
                    [ text (helpers.t "Address This is the web address you use to sign in to your cozy.") ]

              else
                p [ class "error-message" ]
                    [ text (helpers.t model.error) ]
            , div [ class "coz-form-group" ]
                [ label [ class "coz-form-label" ]
                    [ text (helpers.t "Address Cozy address") ]
                , div [ class "https-input-wrapper" ]
                    [ span [ class "address_https" ]
                        [ text "https://" ]
                    , input
                        [ placeholder "cloudy.mycozy.cloud"
                        , classList
                            [ ( "wizard__address", True )
                            , ( "error", model.error /= "" )
                            ]
                        , type_ "text"
                        , value model.address
                        , disabled model.busy
                        , onInput FillAddress
                        , Keyboard.onEnter RegisterRemote
                        , onBlur CorrectAddress
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
                [ class "btn"
                , href "#"
                , if model.address == "" then
                    attribute "disabled" "true"

                  else if model.busy then
                    attribute "aria-busy" "true"

                  else
                    onClick RegisterRemote
                ]
                [ text (helpers.t "Address Next") ]
            ]
        ]
