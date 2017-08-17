port module Account exposing (..)

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
    { address : String
    , deviceName : String
    , disk : DiskSpace
    , busy : Bool
    }


init : Model
init =
    { address = ""
    , deviceName = ""
    , disk =
        { used = 0
        , quota = 0
        }
    , busy = False
    }



-- UPDATE


type Msg
    = FillAddressAndDevice ( String, String )
    | UpdateDiskSpace DiskSpace
    | UnlinkCozy
    | CancelUnlink


port unlinkCozy : () -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillAddressAndDevice ( address, deviceName ) ->
            ( { model | address = address, deviceName = deviceName }, Cmd.none )

        UpdateDiskSpace disk ->
            ( { model | disk = disk }, Cmd.none )

        UnlinkCozy ->
            ( { model | busy = True }, unlinkCozy () )

        CancelUnlink ->
            ( { model | busy = False }, Cmd.none )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        diskUnit =
            helpers.t "Account b"

        diskSpace =
            p [ class "disk-space" ]
                [ img
                    [ src "images/hard-drive.svg"
                    , class "disk-space__icon"
                    ]
                    []
                , text (toString (round (model.disk.used / 1000000)) ++ " M" ++ diskUnit)
                , text " / "
                , text (toString (round (model.disk.quota / 1000000)) ++ " M" ++ diskUnit)
                ]
    in
        section [ class "two-panes__content two-panes__content--account" ]
            [ h1 [] [ text (helpers.t "Account Account") ]
            , h3 [] [ a [ href model.address ] [ text model.address ] ]
            , h2 [] [ text (helpers.t "Account Device name") ]
            , p [] [ text model.deviceName ]
            , h2 [] [ text (helpers.t "Account Cozy disk space") ]
            , diskSpace
            , h2 [] [ text (helpers.t "Account Unlink Cozy") ]
            , p []
                [ text (helpers.t "Account It will unlink your account to this computer.")
                , text " "
                , text (helpers.t "Account Your files won't be deleted.")
                , text " "
                , text (helpers.t "Account Are you sure to unlink this account?")
                ]
            , a
                [ class "btn btn--danger"
                , href "#"
                , if model.busy then
                    attribute "aria-busy" "true"
                  else
                    onClick UnlinkCozy
                ]
                [ text (helpers.t "Account Unlink this Cozy") ]
            ]
