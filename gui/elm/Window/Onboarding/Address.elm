module Window.Onboarding.Address exposing
    ( Model
    , Msg(..)
    , correctAddress
    , dropAppName
    , init
    , setError
    , update
    , view
    )

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Locale exposing (Helpers)
import Ports
import String exposing (contains)
import Url
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
    let
        ( instanceName, topDomain ) =
            case String.split "." address of
                [] ->
                    -- This can't happen because String.split always return a
                    -- list with at least one element but is required by Elm.
                    ( address, "mycozy.cloud" )

                [ instance ] ->
                    -- This should never happen as we already append
                    -- `.mycozy.cloud` to addresses without host
                    ( address, "mycozy.cloud" )

                instance :: rest ->
                    ( instance, String.join "." rest )
    in
    if String.isEmpty address then
        ""

    else if
        String.endsWith "mycozy.cloud" topDomain
            || String.endsWith "mytoutatice.cloud" topDomain
    then
        case String.split "-" instanceName of
            instance :: _ ->
                instance ++ "." ++ topDomain

            _ ->
                instanceName ++ "." ++ topDomain

    else
        -- We can't really tell at this point if the given URL points to a Cozy
        -- using nested domains or not so we can't really drop app names unless
        -- we make a hard list of them.
        instanceName ++ "." ++ topDomain


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
                [ span [] [ text (helpers.t "Address Next") ] ]
            ]
        ]
