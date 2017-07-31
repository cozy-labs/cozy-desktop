port module Settings exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias Model =
    { version : String
    , newRelease : Maybe ( String, String )
    , autoLaunch : Bool
    }


init : String -> Model
init version =
    { version = version
    , newRelease = Nothing
    , autoLaunch = True
    }



-- UPDATE


type Msg
    = SetAutoLaunch Bool
    | AutoLaunchSet Bool
    | QuitAndInstall
    | NewRelease ( String, String )


port autoLauncher : Bool -> Cmd msg


port quitAndInstall : () -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        SetAutoLaunch autoLaunch ->
            ( model, autoLauncher autoLaunch )

        AutoLaunchSet autoLaunch ->
            ( { model | autoLaunch = autoLaunch }, Cmd.none )

        QuitAndInstall ->
            ( model, quitAndInstall () )

        NewRelease ( notes, name ) ->
            ( { model | newRelease = Just ( notes, name ) }, Cmd.none )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        updateDiv =
            case
                model.newRelease
            of
                Nothing ->
                    []

                Just ( notes, name ) ->
                    [ h2 [] [ text (helpers.t "Settings A new release is available") ]
                    , p [] [ text name ]
                    , p [] [ text notes ]
                    , a [ onClick QuitAndInstall, href "#", class "btn btn--action" ]
                        [ text (helpers.t "Settings Install the new release and restart the application") ]
                    ]
    in
        section [ class "two-panes__content two-panes__content--settings" ]
            [ h1 [] [ text (helpers.t "Settings Settings") ]
            , div [ attribute "data-input" "checkbox" ]
                [ input
                    [ type_ "checkbox"
                    , checked model.autoLaunch
                    , id "auto-launch"
                    , onCheck SetAutoLaunch
                    ]
                    []
                , label [ for "auto-launch" ]
                    [ text (helpers.t "Settings Start Cozy Drive on system startup") ]
                ]
            , h2 [] [ text (helpers.t "Settings Version") ]
            , p []
                [ text ("Cozy Drive for Desktop " ++ model.version)
                , br [] []
                , a [ href "https://github.com/cozy-labs/cozy-desktop" ]
                    [ text (helpers.t "Settings Github Page") ]
                ]
            , div [] updateDiv
            ]
