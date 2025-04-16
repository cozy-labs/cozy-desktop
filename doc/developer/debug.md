Tools for debugging
===================

Bugs can happen. Twake Desktop has some tools to track them.


Debug logs
----------

The first and most important one is logging. If you think you might have found
a bug, the first thing to do is running Twake Desktop with debug:

```bash
DEBUG=true yarn start
```

To both keep logs on a file and display them on screen, you can use `tee`:

```bash
DEBUG=true yarn start 2>&1 | tee $(date '+%Y-%m-%d.log')
```

It's possible to have even more logs if you want, by enabling pouchdb debug
logs and request debug logs:

```bash
NODE_DEBUG=request DEBUG=pouchdb:* yarn start
```

When Twake Desktop is running, it's possible to send it the `USR1` signal to
make it list the paths watched by chokidar:

```bash
kill -USR1 <pid>
```
