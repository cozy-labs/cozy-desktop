module TwoPanes (..) where

import Effects exposing (Effects)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Dashboard
import Settings
import Account
import Help


-- MODEL


type Tab
  = DashboardTab
  | SettingsTab
  | AccountTab
  | HelpTab


type alias Model =
  { tab : Tab }


init : Model
init =
  { tab = DashboardTab }



-- UPDATE


type Action
  = NoOp
  | GoToTab Tab


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToTab tab' ->
      ( { model | tab = tab' }, Effects.none )



-- VIEW


view : Signal.Address Action -> Model -> Html
view address model =
  let
    iconSize =
      30

    menu_item title tab icon =
      li
        [ classList
            [ ( "two-panes__menu__item", True )
            , ( "two-panes__menu__item--active", model.tab == tab )
            ]
        ]
        [ a
            [ href "#"
            , onClick address (GoToTab tab)
            ]
            [ icon iconSize
            , span [] [ text title ]
            ]
        ]

    menu =
      aside
        [ class "two-panes__menu" ]
        [ ul
            []
            [ menu_item "Dashboard" DashboardTab Icons.dashboard
            , menu_item "Settings" SettingsTab Icons.settings
            , menu_item "Account" AccountTab Icons.account
            , menu_item "Help" HelpTab Icons.help
            ]
        ]

    content =
      case model.tab of
        DashboardTab ->
          Dashboard.view

        SettingsTab ->
          Settings.view

        AccountTab ->
          Account.view

        HelpTab ->
          Help.view
  in
    section [ class "two-panes" ] [ menu, content ]
