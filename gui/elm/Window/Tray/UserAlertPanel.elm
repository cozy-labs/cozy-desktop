port module Window.Tray.UserAlertPanel exposing
    ( Model
    , Msg(..)
    , init
    , showAlertsPanel
    , update
    , view
    )

import Data.Path as Path
import Data.Platform exposing (Platform)
import Data.UserAlert as UserAlert exposing (UserAlert)
import Html exposing (..)
import Html.Attributes exposing (..)
import I18n exposing (Helpers)
import Ports
import Time



-- MODEL


type alias Model =
    { userAlerts : List UserAlert
    , showAlerts : Bool
    , platform : Platform
    }


init : Platform -> Model
init platform =
    { userAlerts = []
    , showAlerts = False
    , platform = platform
    }



-- UPDATE


port showAlertsPanel : (Bool -> msg) -> Sub msg


type Msg
    = ToggleAlerts
    | SetShowAlerts Bool
    | GotUserAlerts (List UserAlert)
    | UserAlertMsg UserAlert.Msg
    | AlertSkipped UserAlert
    | AlertDone UserAlert


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ToggleAlerts ->
            ( { model | showAlerts = not model.showAlerts }, Cmd.none )

        SetShowAlerts visible ->
            ( { model | showAlerts = visible }, Cmd.none )

        GotUserAlerts alerts ->
            ( { model | userAlerts = alerts }, Cmd.none )

        UserAlertMsg subMsg ->
            case subMsg of
                UserAlert.SendCommand cmd alert ->
                    ( model, Cmd.map UserAlertMsg (UserAlert.sendCommand cmd alert) )

                UserAlert.ShowInParent path showInWeb ->
                    ( model, Ports.showInParent ( Path.toString path, showInWeb ) )

                UserAlert.ShowHelp ->
                    ( model, Ports.showHelp () )

                UserAlert.OpenFile path showInWeb ->
                    ( model, Ports.openFile ( Path.toString path, showInWeb ) )

        AlertSkipped alert ->
            ( { model | userAlerts = filterAlert alert model.userAlerts }, Cmd.none )

        AlertDone alert ->
            ( { model | userAlerts = filterAlert alert model.userAlerts }, Cmd.none )



-- VIEW


view : Helpers -> Time.Posix -> Model -> Html Msg
view helpers now model =
    case ( model.userAlerts, model.showAlerts ) of
        ( [], _ ) ->
            Html.text ""

        ( _, False ) ->
            Html.text ""

        ( alerts, True ) ->
            div [ class "user-alerts" ]
                (List.map
                    (\alert -> Html.map UserAlertMsg (UserAlert.view helpers model.platform now alert))
                    alerts
                )



-- HELPERS


filterAlert : UserAlert -> List UserAlert -> List UserAlert
filterAlert alert =
    List.filter (\a -> not (UserAlert.same alert a))
