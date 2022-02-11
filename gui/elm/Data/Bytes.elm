module Data.Bytes exposing
    ( Bytes
    , Unit(..)
    , compare
    , fromInt
    , humanUnit
    , isZero
    , one_giga
    , one_kilo
    , one_mega
    , toFloat
    , toHuman
    )


type Bytes
    = Bytes Int


type Unit
    = B
    | KB
    | MB
    | GB


one_kilo =
    Bytes 1000


one_mega =
    Bytes 1000000


one_giga =
    Bytes 1000000000


fromInt : Int -> Bytes
fromInt n =
    Bytes n


toFloat : Bytes -> Float
toFloat (Bytes b) =
    Basics.toFloat b



-- Comparisons


isZero : Bytes -> Bool
isZero (Bytes n) =
    n == 0


compare : Bytes -> Bytes -> Order
compare (Bytes left) (Bytes right) =
    if left < right then
        LT

    else if left > right then
        GT

    else
        EQ



-- String formatting


humanUnit : Bytes -> Unit
humanUnit bytes =
    let
        order =
            List.map (compare bytes) [ one_kilo, one_mega, one_giga ]
    in
    case order of
        [ LT, _, _ ] ->
            B

        [ _, LT, _ ] ->
            KB

        [ _, _, LT ] ->
            MB

        _ ->
            GB


toHuman : Bytes -> Unit -> Float
toHuman bytes unit =
    case unit of
        B ->
            toFloat bytes

        KB ->
            toFloat bytes / toFloat one_kilo

        MB ->
            toFloat bytes / toFloat one_mega

        _ ->
            toFloat bytes / toFloat one_giga
