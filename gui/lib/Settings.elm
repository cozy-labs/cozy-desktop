port module Settings exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias Model =
    { version : String
    , autoLaunch : Bool
    }


init : String -> Model
init version' =
    { version = version'
    , autoLaunch = True
    }



-- UPDATE


type Msg
    = SetAutoLaunch Bool
    | AutoLaunchSet Bool


port autoLauncher : Bool -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        SetAutoLaunch autoLaunch' ->
            ( model, autoLauncher autoLaunch' )

        AutoLaunchSet autoLaunch' ->
            ( { model | autoLaunch = autoLaunch' }, Cmd.none )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "two-panes__content two-panes__content--settings" ]
        [ h1 [] [ text (helpers.t "Settings Settings") ]
        , div [ attribute "data-input" "checkbox" ]
            [ input
                [ type' "checkbox"
                , checked model.autoLaunch
                , id "auto-launch"
                , onCheck SetAutoLaunch
                ]
                []
            , label [ for "auto-launch" ]
                [ text (helpers.t "Settings Start Cozy-Desktop on system startup") ]
            ]
        , h2 [] [ text (helpers.t "Settings Version") ]
        , p []
            [ text ("Cozy-Desktop " ++ model.version)
            , br [] []
            , a [ href "https://github.com/cozy-labs/cozy-desktop" ]
                [ text (helpers.t "Settings Github Page") ]
            ]
        ]
