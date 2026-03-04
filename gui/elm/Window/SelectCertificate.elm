module Window.SelectCertificate exposing
    ( Model
    , Msg(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.ClientCertificate as ClientCertificate exposing (ClientCertificate, SerialNumber)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Util.SelectList as SelectList exposing (SelectList)



-- MODEL


type alias Model =
    { siteUrl : String
    , certificates : Maybe (SelectList ClientCertificate)
    }


init : String -> List ClientCertificate -> Model
init siteUrl certificates =
    { siteUrl = siteUrl
    , certificates = buildCertificatesList certificates
    }


buildCertificatesList : List ClientCertificate -> Maybe (SelectList ClientCertificate)
buildCertificatesList certificates =
    case certificates of
        first :: rest ->
            Just (SelectList.fromLists [] first rest)

        _ ->
            Nothing



-- UPDATE


type Msg
    = Select SerialNumber
    | Validate
    | Cancel
    | ReceivedClientCertificates ( String, List ClientCertificate )


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        Select serialNumber ->
            let
                certificates =
                    model.certificates
                        |> Maybe.map (SelectList.select (\c -> c.serialNumber == serialNumber))
            in
            ( { model
                | certificates = certificates
              }
            , Cmd.none
            )

        Validate ->
            case model.certificates of
                Just list ->
                    let
                        serialNumber =
                            SelectList.selected list |> .serialNumber
                    in
                    ( model
                    , ClientCertificate.validateSelection serialNumber
                    )

                Nothing ->
                    ( model
                    , ClientCertificate.validateSelection ClientCertificate.emptySerialNumber
                    )

        Cancel ->
            ( model
            , ClientCertificate.validateSelection ClientCertificate.emptySerialNumber
            )

        ReceivedClientCertificates ( siteUrl, list ) ->
            ( { model
                | siteUrl = siteUrl
                , certificates = buildCertificatesList list
              }
            , Cmd.none
            )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    ClientCertificate.gotCertificates ReceivedClientCertificates



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        ( befores, afters, selected ) =
            case model.certificates of
                Just list ->
                    ( list |> SelectList.before |> List.map (certificateView False)
                    , list |> SelectList.after |> List.map (certificateView False)
                    , list |> SelectList.selected |> certificateView True
                    )

                Nothing ->
                    ( [], [], emptyCertificateView helpers )
    in
    section
        [ style "padding" "1em"
        , style "height" "100vh"
        , style "box-sizing" "border-box"
        , style "display" "grid"
        , style "grid-template-rows" "auto 1fr auto"
        , style "gap" "1em"
        ]
        [ header
            []
            [ h1
                [ style "margin" "0"
                ]
                [ text (helpers.t "SelectCertificate Select a certificate") ]
            , p
                [ style "margin" "0"
                ]
                [ text (helpers.interpolate [ model.siteUrl ] "SelectCertificate Select a certificate to authenticate with {0}.") ]
            ]
        , table
            [ style "display" "grid"
            , style "grid-template-rows" "minmax(auto, max-content) minmax(auto, max-content) auto"
            , style "min-height" "100%"
            ]
            [ thead
                [ style "overflow" "hidden"
                , style "scrollbar-gutter" "stable both-edges"
                , style "margin-left" "-1em"
                , style "margin-right" "-1em"
                ]
                [ tr
                    [ style "display" "grid"
                    , style "grid-template-columns" "1fr 1fr 10em"
                    , style "text-align" "left"
                    , style "border" "1px solid"
                    ]
                    [ th
                        [ style "grid-column" "1"
                        , style "padding" ".5em"
                        , style "border-right" "1px solid"
                        ]
                        [ text (helpers.t "SelectCertificate Object") ]
                    , th
                        [ style "grid-column" "2"
                        , style "padding" ".5em"
                        , style "border-right" "1px solid"
                        ]
                        [ text (helpers.t "SelectCertificate Issuer") ]
                    , th
                        [ style "grid-column" "3"
                        , style "padding" ".5em"
                        ]
                        [ text (helpers.t "SelectCertificate Serial Number") ]
                    ]
                ]
            , tbody
                [ style "display" "block"
                , style "overflow" "auto"
                , style "scrollbar-gutter" "stable both-edges"
                , style "margin-left" "-1em"
                , style "margin-right" "-1em"
                ]
                (befores ++ (selected :: afters))
            , tfoot
                [ style "overflow" "hidden"
                , style "scrollbar-gutter" "stable both-edges"
                , style "margin-left" "-1em"
                , style "margin-right" "-1em"
                ]
                [ tr
                    [ style "display" "block"
                    , style "box-sizing" "border-box"
                    , style "border-left" "1px solid"
                    , style "border-right" "1px solid"
                    , style "border-bottom" "1px solid"
                    , style "min-height" "100%"
                    ]
                    []
                ]
            ]
        , footer
            [ style "display" "flex"
            , style "justify-content" "end"
            , style "gap" "1em"
            ]
            [ button
                [ onClick Cancel
                , style "width" "20%"
                , style "padding" ".5em"
                , style "border-radius" "2em"
                , style "background-color" "var(--secondaryBackground)"
                ]
                [ text (helpers.t "SelectCertificate Cancel") ]
            , button
                [ onClick Validate
                , style "width" "20%"
                , style "padding" ".5em"
                , style "border-radius" "2em"
                , style "background-color" "var(--primaryBackground)"
                ]
                [ text (helpers.t "SelectCertificate OK") ]
            ]
        ]


certificateView : Bool -> ClientCertificate -> Html Msg
certificateView isSelected certificate =
    let
        { subjectName, issuerName, serialNumber } =
            certificate

        longSerial =
            ClientCertificate.serial serialNumber

        shortSerial =
            String.left 14 longSerial

        selectedStyle =
            case isSelected of
                True ->
                    [ style "background-color" "var(--primaryBackground)" ]

                False ->
                    []
    in
    tr
        ([ onClick (Select serialNumber)
         , style "display" "grid"
         , style "grid-template-columns" "1fr 1fr 10em"
         , style "line-height" "2em"
         , style "border-left" "1px solid"
         , style "border-right" "1px solid"
         , style "cursor" "pointer"
         ]
            ++ selectedStyle
        )
        [ td
            [ title subjectName
            , style "display" "block"
            , style "padding" ".5em"
            , style "overflow-x" "hidden"
            , style "text-overflow" "ellipsis"
            ]
            [ text subjectName ]
        , td
            [ title issuerName
            , style "display" "block"
            , style "padding" ".5em"
            , style "overflow-x" "hidden"
            , style "text-overflow" "ellipsis"
            ]
            [ text issuerName ]
        , td
            [ title longSerial
            , style "display" "block"
            , style "padding" ".5em"
            , style "overflow-x" "hidden"
            , style "text-overflow" "ellipsis"
            ]
            [ text shortSerial ]
        ]


emptyCertificateView : Helpers -> Html Msg
emptyCertificateView helpers =
    tr
        [ style "display" "block"
        , style "border-left" "1px solid"
        , style "border-right" "1px solid"
        ]
        [ td
            [ colspan 3
            , style "display" "block"
            , style "padding" ".5em"
            ]
            [ text (helpers.t "SelectCertificate No certificates found for this site") ]
        ]
