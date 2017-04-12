/* @flow */

// Node-style callback
// FIXME: Could not find a way to define a Callback<T> type with multiple
//        signatures.
export type Callback = (?Error, any) => void;

export function composeAsync (f1: (...args: Array<*>) => Promise<*>,
                       f2: (*) => Promise<*>):
                      (...args: Array<*>) => Promise<*> {
  return function composed (...args: Array<*>): Promise<*> {
    return f1(...args).then(f2)
  }
}
