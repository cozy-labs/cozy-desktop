port module Settings exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias DiskSpace =
    { used : Float
    , quota : Float
    }


type alias Model =
    { version : String
    , newRelease : Maybe ( String, String )
    , autoLaunch : Bool
    , address : String
    , deviceName : String
    , disk : DiskSpace
    , busyUnlinking : Bool
    }


init : String -> Model
init version =
    { version = version
    , newRelease = Nothing
    , autoLaunch = True
    , address = ""
    , deviceName = ""
    , disk =
        { used = 0
        , quota = 0
        }
    , busyUnlinking = False
    }



-- UPDATE


type Msg
    = SetAutoLaunch Bool
    | AutoLaunchSet Bool
    | QuitAndInstall
    | NewRelease ( String, String )
    | FillAddressAndDevice ( String, String )
    | UpdateDiskSpace DiskSpace
    | UnlinkCozy
    | CancelUnlink


port unlinkCozy : () -> Cmd msg


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

        FillAddressAndDevice ( address, deviceName ) ->
            ( { model | address = address, deviceName = deviceName }, Cmd.none )

        UpdateDiskSpace disk ->
            ( { model | disk = disk }, Cmd.none )

        UnlinkCozy ->
            ( { model | busyUnlinking = True }, unlinkCozy () )

        CancelUnlink ->
            ( { model | busyUnlinking = False }, Cmd.none )



-- VIEW


humanReadableDisk : Helpers -> Float -> String
humanReadableDisk helpers v =
    (toString (round (v / 1000000)) ++ " M" ++ (helpers.t "Account b"))


versionLine : Helpers -> Model -> Html Msg
versionLine helpers model =
    case model.newRelease of
        Just ( name, changes ) ->
            span [ class "version-need-update" ]
                [ text model.version
                , a [ onClick QuitAndInstall, href "#", class "btn btn--action" ]
                    [ text (helpers.t "Settings Install the new release and restart the application") ]
                ]

        Nothing ->
            span [ class "version-uptodate" ] [ text model.version ]


progressbar : Float -> Html Msg
progressbar ratio =
    div [ class "progress" ]
        [ div
            [ class "progress-inner"
            , style [ ( "width", (toString (100 * ratio)) ++ "%" ) ]
            ]
            []
        ]


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "two-panes__content two-panes__content--settings" ]
        [ h1 [] [ text (helpers.t "Settings Settings") ]
        , h2 [] [ text (helpers.t "Account Cozy disk space") ]
        , div []
            [ text
                ((humanReadableDisk helpers model.disk.used)
                    ++ " / "
                    ++ (humanReadableDisk helpers model.disk.quota)
                )
            ]
        , (progressbar (model.disk.used / (model.disk.quota + 1)))
        , h2 [] [ text (helpers.t "Settings Startup") ]
        , div
            [ class "coz-form-toggle"
            ]
            [ text (helpers.t "Settings Start Cozy Drive on system startup")
            , span [ class "toggle" ]
                [ input
                    [ type_ "checkbox"
                    , checked model.autoLaunch
                    , id "auto-launch"
                    , class "checkbox"
                    , onCheck SetAutoLaunch
                    ]
                    []
                , label [ class "label", for "auto-launch" ] []
                ]
            ]
        , h2 [] [ text (helpers.t "Account About") ]
        , p []
            [ strong [] [ text ((helpers.t "Account Account") ++ " ") ]
            , a [ href model.address ] [ text model.address ]
            ]
        , p []
            [ strong [] [ text ((helpers.t "Account Device name") ++ " ") ]
            , text model.deviceName
            ]
        , p []
            [ strong [] [ text ((helpers.t "Settings Version") ++ " ") ]
            , versionLine helpers model
            ]
        , h2 [] [ text (helpers.t "Account Unlink Cozy") ]
        , p []
            [ text ((helpers.t "Account It will unlink your account to this computer.") ++ " ")
            , text ((helpers.t "Account Your files won't be deleted.") ++ " ")
            , text ((helpers.t "Account Are you sure to unlink this account?") ++ " ")
            ]
        , a
            [ class "btn btn--danger"
            , href "#"
            , if model.busyUnlinking then
                attribute "aria-busy" "true"
              else
                onClick UnlinkCozy
            ]
            [ text (helpers.t "Account Unlink this Cozy") ]
        ]
