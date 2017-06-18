# CoffeeScript to EcmaScript Conversion

The cozy-desktop lib and CLI were historically written in [CoffeeScript][1],
like many Cozy apps. CoffeeScript used to provide many benefits over
EcmaScript, but that's not true anymore:

- EcmaScript has catched up regarding [language features][2]
- it is the standard: it won't die soon
- more people can read/write ES code than CoffeeScript
- ES provides us with more options (there are far more ES libs/tools than
  Coffee ones out there)
- ES tooling is becoming better ([Eslint][3] spots far more issues in our
  codebase than [Coffeelint][4], and tools like [Flow][5] bring static type
  checking to ES)
- As many Cozy apps were rewritten in EcmaScript, going the same way would
  makes the platform more consistent

This is why the code was **converted from CoffeeScript to EcmaScript**.

Part of this was done automatically using [decaffeinate][6]. But some
conversion issues were also fixed afterwards. Build and tools also moved to
the new language stack. The list of changes can be seen in the corresponding
GitHub [pull request][7].

Because of lack of time, some minor issues still remain in the ES code,
like a few useless `return` statements for example.

Those will be adressed progressively while working on new features or
enhancements. But help is still welcome :smile:

[1]: http://coffeescript.org/
[2]: https://babeljs.io/learn-es2015/
[3]: http://eslint.org/
[4]: http://www.coffeelint.org/
[5]: https://flowtype.org/
[6]: http://decaffeinate-project.org/
[7]: https://github.com/cozy-labs/cozy-desktop/pull/485

