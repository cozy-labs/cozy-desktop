# You can use jq to analyse multiple huge log files at once:
#
#   `yarn -s jq -c 'issues|no_gui|xls|short' path/to/logs.txt*`
#
# The `yarn jq` script doesn't use `--slurp` so JSON lines are filtered one by
# one and memory usage is kept below 100MB.
#
# But we should be able to use it in another aggregation script since the lines
# amount should have been reduced by the initial fitering.
#
# TODO: Find a way to make aggregation work, e.g.:
#   `yarn jq 'find_issues|.msg' | yarn jq:frequencies`

# Errors
def error_level: 50;
def is_error: .level >= error_level;
def select_error: select(is_error);
def find_errors: select_error|{component,path,msg,time};

# Warnings
def warn_level: 40;
def is_warn: .level >= warn_level;
def is_warn_strict: .level == warn_level;
def select_warn: select(is_warn);
def select_warn_strict: select(is_warn_strict);
def find_warns: select_warn|{component,path,msg,time};
def find_warns_strict: select_warn_strict|{component,path,msg,time};

# Conflicts
def is_conflict: .msg == "resolveConflictAsync";
def select_conflict: select(is_conflict);
def find_conflicts: select_conflict|{path,time};

# Non-issues
def is_net_error: .msg | test("net::");
def is_maintenance_page: .msg | test("Maintenance en cours");
def is_seq_already_synced: .msg == "Seq was already synced!";
def is_pending_changes: .msg | test("Prepend [0-9]+ pending change");
def is_non_issue:
  (
    is_net_error or is_maintenance_page or is_seq_already_synced or
    is_pending_changes
  );

# Issues
def is_issue: (is_warn or is_conflict) and (is_non_issue | not);
def select_issue: select(is_issue);
def find_issues: select_issue|{component,path,msg,time,level};
def issues: select_issue;

# Path filtering
def filter_path(pattern): select((.path,.oldpath,"")|strings|test(pattern));

# GUI
def is_gui: .component | test("GUI");
def gui: select(is_gui);
def no_gui: select(is_gui | not);

# Config info
def find_client_info:
  select(.appVersion)
    |del(.name)
    |del(.level)
    |del(.v)
    ;

# File extensions
def is_ext(x): .path | test("\\." + x);
def ext(x): select(is_ext(x));
def no_ext(x): select(is_ext(x) | not);
def xls: ext("xls");
def no_xls: no_ext("xls");
def txt: ext("txt");
def no_txt: no_ext("txt");

# Remove stuff that polutes global overview
def short:
  del(.change) |
  del(.err) |
  del(.hostname) |
  del(.level) |
  del(.name) |
  del(.pid) |
  del(.v);

# Utils
def frequencies:
  reduce .[] as $x ({};
    . as $counts | $counts + {($x): (1 + (($counts|getpath([$x])) // 0))}
  );
