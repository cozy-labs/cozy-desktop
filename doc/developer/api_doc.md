# API Documentation

## Build

To build the API documentation locally:

```
yarn jsdoc
```

To browse the generated documentation:

```
xdg-open ./doc/api/index.html || open ./doc/api/index.html
```

To rebuild automatically as you edit the source comments:

```
yarn jsdoc:watch
```

## Publish

To publish the API documentation at
https://cozy-labs.github.io/cozy-desktop/doc/api/ :

```
git checkout gh-pages
git fetch
git reset --hard origin/master
yarn jsdoc
git add -f doc/api/
git commit -m build
git push -f
```
