# Ignore Files or Directories

It's possible to make cozy-desktop ignore some files and folders by using a
`.cozyignore` file. It works pretty much like a `.gitignore`, ie you put
patterns in this file to ignore. The rules for patterns are the same, so you
can look at
[git documentation](https://git-scm.com/docs/gitignore/#_pattern_format) to
see for their format. For example:

```bash
*.mp4
heavy-*
/tmp
```
