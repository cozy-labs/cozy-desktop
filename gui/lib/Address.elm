port module Address exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Focus exposing (focus)
import OnEnter exposing (onEnter)


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
    | PingCozy
    | Pong (Maybe String)


port pingCozy : String -> Cmd msg


setError : Model -> String -> ( Model, Cmd msg, Maybe String )
setError model message =
    ( { model | error = message, busy = False }
    , focus ".wizard__address"
    , Nothing
    )


update : Msg -> Model -> ( Model, Cmd Msg, Maybe String )
update msg model =
    case
        msg
    of
        FillAddress address' ->
            ( { address = address', error = "", busy = False }, Cmd.none, Nothing )

        PingCozy ->
            if model.address == "" then
                setError model "You don't have filled the address!"
            else
                ( { model | busy = True }, pingCozy model.address, Nothing )

        Pong Nothing ->
            setError model "No cozy instance at this address!"

        Pong (Just address') ->
            let
                model' =
                    { model | address = address', error = "", busy = False }
            in
                ( model', Cmd.none, Just address' )



-- SUBSCRIPTIONS


port pong : (Maybe String -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    pong Pong



-- VIEW


view : Model -> Html Msg
view model =
    div
        [ classList
            [ ( "step", True )
            , ( "step-address", True )
            , ( "step-error", model.error /= "" )
            ]
        ]
        [ p [ class "upper error-message" ]
            [ text model.error ]
        , div [ class "upper" ]
            [ input
                [ placeholder "Cozy address"
                , class "wizard__address"
                , value model.address
                , onInput FillAddress
                , onEnter PingCozy
                ]
                []
            ]
        , p []
            [ text "This is the web address you use to sign in to your cozy." ]
        , a
            [ href "https://cozy.io/en/try-it/"
            , class "more-info"
            ]
            [ text "Don't have an account? Request one here" ]
        , a
            [ class "btn"
            , href "#"
            , if model.busy then
                attribute "aria-busy" "true"
              else
                onClick PingCozy
            ]
            [ text "Next" ]
        ]
