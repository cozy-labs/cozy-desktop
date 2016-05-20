port module Settings exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
    { version : String
    , autoLaunch : Bool
    }


init : Model
init =
    { version = ""
    , autoLaunch = True
    }



-- UPDATE


type Msg
    = SetAutoLaunch Bool
    | AutoLaunchSet Bool
    | SetVersion String


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

        SetVersion version' ->
            ( { model | version = version' }, Cmd.none )



-- VIEW


view : Model -> Html Msg
view model =
    section [ class "two-panes__content two-panes__content--settings" ]
        [ h1 [] [ text "Settings" ]
        , div [ attribute "data-input" "checkbox" ]
            [ input
                [ type' "checkbox"
                , checked model.autoLaunch
                , id "auto-launch"
                , onCheck SetAutoLaunch
                ]
                []
            , label [ for "auto-launch" ]
                [ text "Start Cozy-Desktop on system startup" ]
            ]
        , h2 [] [ text "Version" ]
        , p []
            [ text ("Cozy-Desktop " ++ model.version)
            , br [] []
            , a [ href "https://github.com/cozy-labs/cozy-desktop" ]
                [ text "Github Page" ]
            ]
        ]
