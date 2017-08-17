port module Address exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import String exposing (contains)
import Focus exposing (focus)
import Helpers exposing (Helpers)
import OnEnter exposing (onEnter)
import Icons


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


port registerRemote : String -> Cmd msg


setError : Model -> String -> ( Model, Cmd msg )
setError model message =
    ( { model | error = message, busy = False }
    , focus ".wizard__address"
    )


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillAddress address ->
            ( { model | address = address, error = "", busy = False }, Cmd.none )

        RegisterRemote ->
            if model.address == "" then
                setError model "Address You don't have filled the address!"
            else if contains "@" model.address then
                setError model "Address No email address"
            else
                ( { model | busy = True }, registerRemote model.address )

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
                , input
                    [ placeholder ("cloudy.mycozy.cloud")
                    , class "wizard__address"
                    , type_ "text"
                    , value model.address
                    , onInput FillAddress
                    , onEnter RegisterRemote
                    ]
                    []
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
