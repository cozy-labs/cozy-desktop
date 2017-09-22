How to increase the number of inotify watches
=============================================


What is this limit?
-------------------

Under GNU/Linux, cozy-desktop is notified of file system changes via inotify.
This mechanism has a limit for the number of files and directories that it can
watch, to avoid taking too much memory.

On modern computers, it is recommended to use at least 524288 for this limit.


How to increase it
------------------

If you are running Ubuntu, Debian, RedHat, or another similar Linux
distribution, run the following in a terminal:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf \
&& sudo sysctl -p
```

If you are running ArchLinux, run the following command instead:

```bash
echo fs.inotify.max_user_watches=524288 \
| sudo tee /etc/sysctl.d/40-max-user-watches.conf \
&& sudo sysctl --system
```


More info
---------

* Wiki of Listen: [Increasing the amount of inotify watchers][0]
* Manual of [inotify(7)][1]
* Blog post: [limit of inotify][2]
* Forum: [How can I tell if I am out of inotify watches?][3]


[0]:  https://github.com/guard/listen/wiki/Increasing-the-amount-of-inotify-watchers
[1]:  http://linux.die.net/man/7/inotify
[2]:  http://blog.sorah.jp/2012/01/24/inotify-limitation
[3]:  https://askubuntu.com/questions/154255/how-can-i-tell-if-i-am-out-of-inotify-watches
