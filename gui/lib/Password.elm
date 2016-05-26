port module Password exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Focus exposing (focus)
import Helpers exposing (Helpers)
import OnEnter exposing (onEnter)


-- MODEL


type alias Model =
    { password : String
    , address : String
    , error : String
    , busy : Bool
    }


init : Model
init =
    { password = ""
    , address = ""
    , error = ""
    , busy = False
    }



-- UPDATE


type Msg
    = FillPassword String
    | FillAddress String
    | SetError String
    | GoToPrevPage
    | Register
    | Registered (Maybe String)


type Navigation
    = None
    | NextPage
    | PrevPage


port registerRemote : ( String, String ) -> Cmd msg


setError : Model -> String -> ( Model, Cmd msg, Navigation )
setError model message =
    ( { model | error = message, busy = False }
    , focus ".wizard__password"
    , None
    )


update : Msg -> Model -> ( Model, Cmd Msg, Navigation )
update msg model =
    case
        msg
    of
        FillPassword password' ->
            let
                model' =
                    { model | password = password', error = "", busy = False }
            in
                ( model', Cmd.none, None )

        FillAddress address' ->
            let
                model' =
                    { model | address = address', busy = False }
            in
                ( model', Cmd.none, None )

        SetError error ->
            setError model error

        GoToPrevPage ->
            ( model, Cmd.none, PrevPage )

        Register ->
            if model.password == "" then
                setError model "You don't have filled the password!"
            else
                let
                    model' =
                        { model | busy = True }

                    cmd =
                        registerRemote ( model.address, model.password )
                in
                    ( model', cmd, None )

        Registered Nothing ->
            ( { model | busy = False }, Cmd.none, NextPage )

        Registered (Just error) ->
            setError model error



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    div
        [ classList
            [ ( "step", True )
            , ( "step-password", True )
            , ( "step-error", model.error /= "" )
            ]
        ]
        [ p [ class "upper error-message" ]
            [ text model.error ]
        , div [ class "upper" ]
            [ input
                [ placeholder (helpers.t "Password Password")
                , class "wizard__password"
                , type' "password"
                , value model.password
                , onInput FillPassword
                , onEnter Register
                ]
                []
            ]
        , p []
            [ text (helpers.t "Password Your password for the cozy address:")
            , text " "
            , em [] [ text model.address ]
            ]
        , a
            [ href "#"
            , class "more-info"
            , onClick GoToPrevPage
            ]
            [ text (helpers.t "Password Wrong cozy address?") ]
        , a
            [ class "btn"
            , href "#"
            , if model.busy then
                attribute "aria-busy" "true"
              else
                onClick Register
            ]
            [ text (helpers.t "Password Login") ]
        ]
