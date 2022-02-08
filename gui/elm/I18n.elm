module I18n exposing
    ( DistanceOfTime
    , Helpers
    , Locale
    , Pluralize
    , Translate
    , decodeAll
    , decoder
    , defaultLocale
    , distance_of_time_in_words
    , helpers
    , interpolate
    , isSingular
    , pluralize
    , translate
    )

import Dict exposing (Dict)
import FormatNumber
import FormatNumber.Locales exposing (Decimals(..), base, frenchLocale, spanishLocale, usLocale)
import Json.Decode as Json
import Regex exposing (Regex)
import Time


type alias Locale =
    { strings : Dict String String, numbers : FormatNumber.Locales.Locale }


type alias Translate =
    String -> String


type alias Capitalize =
    String -> String


type alias Interpolate =
    List String -> String -> String


type alias Pluralize =
    Int -> String -> String -> String


type alias DistanceOfTime =
    Time.Posix -> Time.Posix -> String


type alias LocalizeNumber =
    Float -> String


type alias Helpers =
    { t : Translate
    , capitalize : Capitalize
    , interpolate : Interpolate
    , pluralize : Pluralize
    , distance_of_time_in_words : DistanceOfTime
    , localizeNumber : LocalizeNumber
    }


defaultLocale =
    { strings = Dict.empty, numbers = base }


decodeAll : Json.Value -> Dict String Locale
decodeAll json =
    case Json.decodeValue decoder json of
        Ok value ->
            value

        Err _ ->
            Dict.empty


decoder : Json.Decoder (Dict String Locale)
decoder =
    Json.map (Dict.map stringsToLocale) (Json.dict stringsDecoder)


stringsDecoder : Json.Decoder (Dict String String)
stringsDecoder =
    Json.dict Json.string


stringsToLocale : String -> Dict String String -> Locale
stringsToLocale locale strings =
    case locale of
        "fr" ->
            Locale strings frenchLocale

        "es" ->
            Locale strings spanishLocale

        _ ->
            Locale strings usLocale


helpers : Locale -> Helpers
helpers locale =
    Helpers (translate locale)
        (capitalize locale)
        (interpolate locale)
        (pluralize locale)
        (distance_of_time_in_words locale)
        (localizeNumber locale)


translate : Locale -> Translate
translate { strings } key =
    case
        Dict.get key strings
    of
        Nothing ->
            key

        Just translation ->
            translation


capitalize : Locale -> Capitalize
capitalize locale lowercase =
    let
        translated =
            translate locale lowercase
    in
    case String.uncons translated of
        Just ( l, rest ) ->
            -- Char.toLocaleUpper does not allow passing in the locale so it
            -- will use the system default locale
            String.cons (Char.toLocaleUpper l) rest

        Nothing ->
            ""


isSingular : Int -> Bool
isSingular count =
    count == 1


pluralize : Locale -> Pluralize
pluralize locale count singular plural =
    let
        translated =
            if isSingular count then
                translate locale singular

            else
                translate locale plural
    in
    String.fromInt count ++ " " ++ translated


placeholder : Regex
placeholder =
    Maybe.withDefault Regex.never <|
        Regex.fromString "\\{([0-9]|[1-9][0-9]+)\\}"


at : a -> Int -> List a -> a
at default index list =
    List.drop index list
        |> List.head
        |> Maybe.withDefault default


interpolate : Locale -> Interpolate
interpolate locale replacements string =
    let
        translatedReplacements =
            List.map (translate locale) replacements

        translated =
            translate locale string
    in
    Regex.replace placeholder (\{ number } -> at "" (number - 1) translatedReplacements) translated


distance_of_time_in_words : Locale -> DistanceOfTime
distance_of_time_in_words locale from_time to_time =
    let
        distance =
            toFloat (Time.posixToMillis to_time - Time.posixToMillis from_time)

        distance_in_minutes =
            round (distance / 1000 / 60)

        distance_in_hours =
            round (distance / 1000 / 3600)

        distance_in_days =
            round (distance / 1000 / 3600 / 24)

        distance_in_months =
            round (distance / 1000 / 3600 / 24 / 30)

        transform count what =
            let
                key =
                    if isSingular count then
                        "Helpers {0} " ++ what ++ " ago"

                    else
                        "Helpers {0} " ++ what ++ "s ago"
            in
            interpolate locale [ String.fromInt count ] key
    in
    if distance_in_months > 0 then
        transform distance_in_months "month"

    else if distance_in_days > 0 then
        transform distance_in_days "day"

    else if distance_in_hours > 0 then
        transform distance_in_hours "hour"

    else if distance_in_minutes > 0 then
        transform distance_in_minutes "minute"

    else
        translate locale "Helpers Just now"


localizeNumber : Locale -> LocalizeNumber
localizeNumber { numbers } number =
    FormatNumber.format { numbers | decimals = Exact 1 } number
