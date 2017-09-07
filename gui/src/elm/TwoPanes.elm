module TwoPanes exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)
import Icons
import Dashboard
import Settings


-- MODEL


type Tab
    = DashboardTab
    | SettingsTab



-- | AppsTab in the future


type alias Model =
    { tab : Tab
    , dashboard : Dashboard.Model
    , settings : Settings.Model
    }


init : String -> Model
init version =
    { tab = DashboardTab
    , dashboard = Dashboard.init
    , settings = Settings.init version
    }



-- UPDATE


type Msg
    = NoOp
    | GoToTab Tab
    | GoToStrTab String
    | FillAddressAndDevice ( String, String )
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        GoToTab tab_ ->
            let
                dashboard =
                    model.dashboard

                newDashboard =
                    { dashboard | page = 1 }
            in
                ( { model | tab = tab_, dashboard = newDashboard }, Cmd.none )

        GoToStrTab tab ->
            case
                tab
            of
                "settings" ->
                    update (GoToTab SettingsTab) model

                _ ->
                    update (GoToTab DashboardTab) model

        FillAddressAndDevice info ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.FillAddressAndDevice info) model.settings
            in
                ( { model | settings = settings }, Cmd.none )

        DashboardMsg subMsg ->
            let
                dashboard =
                    Dashboard.update subMsg model.dashboard
            in
                ( { model | dashboard = dashboard }, Cmd.none )

        SettingsMsg subMsg ->
            let
                ( settings, cmd ) =
                    Settings.update subMsg model.settings
            in
                ( { model | settings = settings }, Cmd.map SettingsMsg cmd )



-- VIEW
--menu_item : Helpers -> Model -> String -> Tab -> Icons.IconFunction -> Html Msg


menu_item helpers model title tab icon =
    li
        [ classList
            [ ( "two-panes__menu__item", True )
            , ( "two-panes__menu__item--active", model.tab == tab )
            ]
        ]
        [ a
            [ href "#"
            , onClick (GoToTab tab)
            ]
            [ icon 20 (model.tab == tab)
            , text (helpers.t ("TwoPanes " ++ title))
            ]
        ]


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        menu =
            aside [ class "two-panes__menu" ]
                [ ul []
                    [ menu_item helpers model "Recents" DashboardTab Icons.dashboard
                    , menu_item helpers model "Settings" SettingsTab Icons.settings
                    ]
                ]

        content =
            case model.tab of
                DashboardTab ->
                    Html.map DashboardMsg (Dashboard.view helpers model.dashboard)

                SettingsTab ->
                    Html.map SettingsMsg (Settings.view helpers model.settings)
    in
        section [ class "two-panes" ] [ menu, content ]
