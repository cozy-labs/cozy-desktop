/* @flow */

// Builds a RegExp that looks globally for the given chars
export function charsFinder (chars: Set<string>): RegExp {
  return new RegExp('[' +
    Array.from(chars).join('')
      // Escape chars that would be interpreted by the RegExp
      .replace('\\', '\\\\') +
    ']', 'g')
}
