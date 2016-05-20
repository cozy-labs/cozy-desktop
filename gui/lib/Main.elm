port module Main exposing (..)

import Html exposing (Html)
import Html.App as Html
import Wizard
import TwoPanes
import Unlinked


main =
    Html.program
        { init = init
        , update = update
        , view = view
        , subscriptions = subscriptions
        }



-- MODEL


type Page
    = WizardPage
    | TwoPanesPage
    | UnlinkedPage


type alias Model =
    { page : Page
    , wizard : Wizard.Model
    , twopanes : TwoPanes.Model
    }


init : ( Model, Cmd Msg )
init =
    let
        page =
            WizardPage

        wizard =
            Wizard.init

        twopanes =
            TwoPanes.init

        model =
            Model page wizard twopanes
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = NoOp
    | WizardMsg Wizard.Msg
    | SyncStart String
    | TwoPanesMsg TwoPanes.Msg
    | Unlink Bool
    | Restart


port restart : Bool -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        WizardMsg msg' ->
            let
                ( wizard', cmd ) =
                    Wizard.update msg' model.wizard
            in
                ( { model | wizard = wizard' }, Cmd.map WizardMsg cmd )

        SyncStart address ->
            let
                ( twopanes', _ ) =
                    TwoPanes.update (TwoPanes.FillAddress address) model.twopanes
            in
                ( { model | page = TwoPanesPage, twopanes = twopanes' }, Cmd.none )

        TwoPanesMsg msg' ->
            let
                ( twopanes', cmd ) =
                    TwoPanes.update msg' model.twopanes
            in
                ( { model | twopanes = twopanes' }, Cmd.map TwoPanesMsg cmd )

        Unlink _ ->
            ( { model | page = UnlinkedPage }, Cmd.none )

        Restart ->
            ( model, restart True )

        NoOp ->
            ( model, Cmd.none )



-- SUBSCRIPTIONS


port synchonization : (String -> msg) -> Sub msg



-- https://github.com/elm-lang/elm-compiler/issues/1367


port unlink : (Bool -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ Sub.map WizardMsg (Wizard.subscriptions model.wizard)
        , Sub.map TwoPanesMsg (TwoPanes.subscriptions model.twopanes)
        , synchonization SyncStart
        , unlink Unlink
        ]



-- VIEW


view : Model -> Html Msg
view model =
    case
        model.page
    of
        WizardPage ->
            Html.map WizardMsg (Wizard.view model.wizard)

        TwoPanesPage ->
            Html.map TwoPanesMsg (TwoPanes.view model.twopanes)

        UnlinkedPage ->
            Html.map (\_ -> Restart) Unlinked.view
