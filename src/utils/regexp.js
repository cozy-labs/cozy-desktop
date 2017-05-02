/* @flow */

// Same as String#match, but return all the matches
export function matchAll (s: string, r: RegExp): Array<string> {
  const matches = []
  s.replace(r, match => {
    matches.push(match)
    // We abuse replace() since JavaScript doesn't have a matchAll method,
    // hence the string result
    return ''
  })
  return matches
}

// Builds a RegExp that looks globally for the given chars
export function charsFinder (chars: Set<string>): RegExp {
  return new RegExp('[' +
    Array.from(chars).join('')
      // Escape chars that would be interpreted by the RegExp
      .replace('\\', '\\\\') +
    ']', 'g')
}
