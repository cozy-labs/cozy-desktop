port module Address exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import String exposing (contains)
import Focus exposing (focus)
import Helpers exposing (Helpers)
import OnEnter exposing (onEnter)


-- MODEL


type alias Model =
    { address : String
    , error : String
    , busy : Bool
    , platform : String
    }


init : String -> Model
init platform =
    { address = ""
    , error = ""
    , busy = False
    , platform = platform
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
        [ p [ class "upper error-message" ]
            [ text (helpers.t model.error) ]
        , div [ class "upper" ]
            [ input
                [ placeholder (helpers.t "Address Cozy address")
                , class "wizard__address"
                , value model.address
                , onInput FillAddress
                , onEnter RegisterRemote
                ]
                []
            ]
        , p []
            [ text (helpers.t "Address This is the web address you use to sign in to your cozy.") ]
        , a
            [ href ("https://cozy.io/en/try-it/?from=desktop-" ++ model.platform)
            , class "more-info"
            ]
            [ text (helpers.t "Address Don't have an account? Request one here") ]
        , a
            [ class "btn"
            , href "#"
            , if model.busy then
                attribute "aria-busy" "true"
              else
                onClick RegisterRemote
            ]
            [ text (helpers.t "Address Next") ]
        ]
