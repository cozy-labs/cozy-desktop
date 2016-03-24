module TwoPanes (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Effects exposing (Effects)
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
    menu_item title tab =
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
            [ text title ]
        ]

    menu =
      aside
        [ class "two-panes__menu" ]
        [ ul
            []
            [ menu_item "Dashboard" DashboardTab
            , menu_item "Settings" SettingsTab
            , menu_item "Account" AccountTab
            , menu_item "Help" HelpTab
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
