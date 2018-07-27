Here we verify and document critical assumptions we make about the external
World: operating systems, file systems, Node.js behavior...

We now that some of those assumptions are wrong, e.g. assuming some filesystem
according to the platform. We made them in order to be able to quickly build a
first version of the app that would still work for most people using the
default settings of their operating system. We intend to fix it at some point.
