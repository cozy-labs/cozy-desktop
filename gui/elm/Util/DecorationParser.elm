module Util.DecorationParser exposing (DecorationResult(..), findDecorations)

import Parser exposing (..)


type DecorationResult
    = Decorated String
    | Normal String


decorationChar =
    "`"


isDecorationStartChar : Char -> Bool
isDecorationStartChar char =
    String.fromChar char == decorationChar


isNormalChar : Char -> Bool
isNormalChar char =
    not (isDecorationStartChar char)


trimDecorationChars : String -> () -> String
trimDecorationChars decorated parsed =
    decorated |> String.dropLeft 1 |> String.dropRight 1


checkEnding : Bool -> Parser ()
checkEnding badEnding =
    if badEnding then
        problem "normal string should not end with decoration character"

    else
        commit ()


endsWithDecorationChar : Parser Bool
endsWithDecorationChar =
    oneOf
        [ map (\_ -> True) (symbol decorationChar)
        , succeed False
        ]



{- A decorated string is a bunch of characters delimited by decoration
   characters. Decorated strings are not nestable.
-}


decoratedString : Parser DecorationResult
decoratedString =
    backtrackable (symbol decorationChar)
        |. chompWhile isNormalChar
        |. symbol decorationChar
        |> mapChompedString trimDecorationChars
        |> map Decorated



{- A normal string is a string starting with a bunch of decoration characters (1
   or more) and not ending with another decoration character, or a string not
   containing any decoration character.
-}


normalString : Parser DecorationResult
normalString =
    oneOf
        [ backtrackable (symbol decorationChar)
            |. chompWhile isDecorationStartChar
            |. chompWhile isNormalChar
            |. end
        , chompWhile isNormalChar
        ]
        |> getChompedString
        |> map Normal


decoration : Parser DecorationResult
decoration =
    oneOf
        [ backtrackable normalString, decoratedString ]



{- The decorations parser returns a list of parts of the parsed string with a
   decoration hint (i.e. Decorated or Normal).
-}


decorations : Parser (List DecorationResult)
decorations =
    loop ( [], 0 ) <|
        ifProgress <|
            decoration


findDecorations : String -> List DecorationResult
findDecorations string =
    let
        mergeNormalStrings =
            \dec prevDecs ->
                let
                    prevDec =
                        List.head prevDecs
                in
                case ( dec, prevDec ) of
                    ( Normal currStr, Just (Normal prevStr) ) ->
                        Normal (currStr ++ prevStr) :: List.drop 1 prevDecs

                    _ ->
                        dec :: prevDecs
    in
    case run decorations string of
        Result.Ok parsedDecorations ->
            List.foldr mergeNormalStrings [] parsedDecorations

        _ ->
            [ Normal string ]



-- Loop helper


ifProgress : Parser a -> ( List a, Int ) -> Parser (Step ( List a, Int ) (List a))
ifProgress parser ( prevDecs, offset ) =
    succeed (\dec newOffset -> ( dec, newOffset ))
        |= parser
        |= getOffset
        |> map
            (\( dec, newOffset ) ->
                if offset == newOffset then
                    Done (List.reverse prevDecs)

                else
                    Loop ( dec :: prevDecs, newOffset )
            )
