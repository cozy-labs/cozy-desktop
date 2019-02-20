# Custom jq filters for log analysis.
# See doc/developer/log_analysis.md to get started.

# Remove fields that are almost never used while debugging.
# To be used in other filters.
def clean:
  del(.hostname) |
  del(.name) |
  del(.pid) |
  del(.v);

# Filter by log level:
#
#     yarn jq error path/to/logs*
#     yarn jq warn path/to/logs*
#
# To get strictly warnings (without errors):
#
#     yarn jq warn_strict path/to/logs*
#
def error_level: 50;
def is_error: .level >= error_level;
def error: clean | select(is_error);
def warn_level: 40;
def is_warn: .level >= warn_level;
def is_warn_strict: .level == warn_level;
def warn: clean | select(is_warn);
def warn_strict: clean | select(is_warn_strict);
def info_level: 30;
def is_info: .level >= info_level;
def info: clean | select(is_info);
def debug_level: 20;
def is_debug: .level >= debug_level;
def debug: clean | select(is_debug);

# Components:
def component(pattern): select(.component | test(pattern));
def App: component("^App$");
def Chokidar: component("^Chokidar|chokidar$");
def Fs: component("^Fs|FS$");
def LocalAnalysis: component("^LocalAnalysis|local/analysis$");
def LocalChange: component("^LocalChange|local/change$");
def LocalWatcher: component("^LocalWatcher$");
def LocalWriter: component("^LocalWriter$");
def Merge: component("^Merge$");
def Metadata: component("^Metadata$");
def Perfs: component("^Perfs|PerfReports$");
def Pouch: component("^Pouch$");
def Prep: component("^Prep$");
def RemoteCozy: component("^RemoteCozy$");
def RemoteUserActionRequired: component("^RemoteUserActionRequired|remote/user_action_required$");
def RemoteWarningPoller: component("^RemoteWarningPoller$");
def RemoteWatcher: component("^RemoteWatcher$");
def RemoteWriter: component("^RemoteWriter$");
def Sync: component("^Sync$");

def Local: select(.component | test("^local|chokidar"; "i"));
def Remote: select(.component | test("^remote"; "i"));

# Exclude "up-to-date" messages
#
#     yarn jq nouptodate path/to/logs*
#
def nouptodate: select(.msg | test("up[- ]to[- ]date") | not);

# Exclude Proxy stuff:
#
#     yarn jq noproxy path/to/logs*
#
def noproxy: select(.component | test("GUI:proxy") | not);

# Find conflicts:
#
#     yarn jq -c conflict path/to/logs*
#
def is_conflict: .msg == "resolveConflictAsync";
def conflict: clean | select(is_conflict);

# Non-issue filters (so we can ignore them when looking for real issues):
def is_net_error: .msg | test("net::");
def is_maintenance_page: .msg | test("Maintenance en cours");
def is_seq_already_synced: .msg == "Seq was already synced!";
def is_pending_changes: .msg | test("Prepend [0-9]+ pending change");
def is_non_issue:
  (
    is_net_error or is_maintenance_page or is_seq_already_synced or
    is_pending_changes
  );

# Find main issues:
#
#     yarn jq issues path/to/logs*
#
def is_issue: (is_warn or is_conflict) and (is_non_issue | not);
def issues: clean | select(is_issue);

# Filter by path (should handle moves, conflict renaming...):
#
#     yarn jq 'path("foo/bar")' path/to/logs*
#     yarn jq 'path("foo\\\\bar")' path/to/logs*
#
# FIXME: Should not output the same line twice when both path & oldpath match.
def path(pattern):
  clean | select(
    (
      (.path // (.doc | .path) // (.change | .doc | .path) // (.idConflict | .newDoc | .path)),
      (.oldpath // (.was | .path) // (.idConflict | .existingDoc | .path)),
      ""
    )
      | strings
      | test(pattern)
  );

# Include/exclude GUI stuff:
#
#    yarn jq gui path/to/logs*
#    yarn jq no_gui path/to/logs*
#
def is_gui: .component | test("GUI");
def gui: select(is_gui);
def no_gui: select(is_gui | not);

# To make `mocha` component messages more visible in test logs:
#
#    yarn jq -c 'debug|short|mocha' debug.log
#
# Or to completely ignore them:
#
#    yarn jq -c no_mocha debug.log
#
# Please note the `mocha` filter should always be the last one since it
# converts mocha log entries to strings.
def is_mocha: .component == "mocha";
def mocha: if is_mocha then .msg | gsub("\\n+"; "") else . end;
def no_mocha: select(is_mocha | not);

# Find the OS / app versions:
#
#     yarn jq client path/to/logs*
#
def client:
  select(.appVersion)
    |del(.name)
    |del(.level)
    |del(.v)
    ;

# Filter by file extension:
#
#    yarn jq 'ext("png")' path/to/logs*
#
# You can use/define additional filters for common extensions:
#
#    yarn jq xls path/to/logs*
#
def is_ext(x): .path | test("\\." + x);
def ext(x): select(is_ext(x));
def no_ext(x): select(is_ext(x) | not);
def xls: ext("xls");
def no_xls: no_ext("xls");
def txt: ext("txt");
def no_txt: no_ext("txt");

# Filter by msg pattern:
#
#    yarn jq 'msg("422")' path/to/logs*
#    yarn jq 'msg("offline$")' path/to/logs*
#
def msg(pattern):
  select(.msg | test(pattern));

# Filter by time pattern:
#
#    yarn jq 'time("2018-04-14T22:34:25.453Z")' path/to/logs*
#    yarn jq 'time("2018-04-14")' path/to/logs*
#    yarn jq 'time("T22:34")' path/to/logs*
#    yarn jq 'before("2018-04-14T22:34:25.453Z")' path/to/logs* // inclusive
#    yarn jq 'after("2018-04-14T22:34:25.453Z")' path/to/logs* // inclusive
#
def time(pattern):
  select(.time | test(pattern));
def before(time): select(.time <= time);
def after(time): select(.time >= time);

# Drop time properties
def notime: del(.time);

# Filter inode number(s):
#
#    yarn jq 'ino(7852458)' path/to/logs*
#    yarn jq 'ino(7852458; 464672)' path/to/logs*
#
def ino(n): select((.ino // (.doc|.ino) // (.change|.doc|.ino)) as $ino | [n] | flatten | map(. == $ino) | any);

# Filter things with an attached doc and return it:
#
#    yarn jq 'Pouch|doc' path/to/logs*
#
def doc:
  select(.doc) | .doc;

# Get a global overview of another filter:
#
#    yarn -s jq -c 'select(...)|short' path/to/logs*
#
def short:
  {time,component,uuid,msg,path,oldpath,kind,action}
    | if .uuid then . else del(.uuid) end
    | if .kind then . else del(.kind) end
    | if .action then . else del(.action) end
    | if .oldpath then . else del(.oldpath) end
    ;

# FIXME: Find a way to make aggregation work, e.g.:
#
#     yarn jq 'issues|.msg' | yarn jq:frequencies
#
# We should be able to use --slurp in another aggregation script since the lines
# amount should have been reduced by the initial fitering.
def frequencies:
  reduce .[] as $x ({};
    . as $counts | $counts + {($x): (1 + (($counts|getpath([$x])) // 0))}
  );
