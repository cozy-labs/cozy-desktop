port module Account exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
    { address : String
    , busy : Bool
    }


init : Model
init =
    { address = ""
    , busy = False
    }



-- UPDATE


type Msg
    = FillAddress String
    | UnlinkCozy


port unlinkCozy : () -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        FillAddress address' ->
            ( { model | address = address' }, Cmd.none )

        UnlinkCozy ->
            ( { model | busy = True }, unlinkCozy () )



-- VIEW


view : Model -> Html Msg
view model =
    section [ class "two-panes__content two-panes__content--account" ]
        [ h1 [] [ text "Account" ]
        , h3 []
            [ a [ href model.address ] [ text model.address ] ]
        , h2 [] [ text "Unlink Cozy" ]
        , p []
            [ text "It will unlink your account to this computer. "
            , text "Your files won't be deleted. "
            , text "Are you sure to unlink this account?"
            ]
        , a
            [ class "btn btn--danger"
            , href "#"
            , if model.busy then
                attribute "aria-busy" "true"
              else
                onClick UnlinkCozy
            ]
            [ text "Unlink this Cozy" ]
        ]
