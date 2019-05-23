# Test scenarios

Those tests describe some synchronization scenarios (e.g. moving a file) with
their corresponding expectations.

## Motivation

Scenarios were introduced when the dir/file move handling was refactored to
prevent reference loss (sharings, connectors...). On the beginning of this
refactoring, we were lacking:

- An overview of the way user actions were synchronized
- End-to-end test coverage
- Determinist integration tests because both chokidar and the remote
  changesfeed could give us events/changes in an unexpected order.
- A way to refactor some tests very quickly while still keeping them coherent
  when we were moving forward.

We were aware of BDD (Behavior Driven Development) tools like Cucumber.js, but
we wanted something that would require less boilerplate and fit our specific
needs.

The best design was not clear, so the choice was made to describe scenarios as
plain data (not js/mocha code), in order to be able to:

- Have the simplest possible syntax to describe synchronization cases (done)
- Prevent them from diverging while moving fast (done)
- Reuse any part of them (done, see captures below)
- Instrument them as additional faster unit tests (not done yet)
- Generate them with code as needed (not done yet)

## Scenario description

Scenarios are described as plain JavaScript data structures (not code) in
`test/scenarios/<scenario_name>/scenario.js` files, including:

- An optional starting side restriction (most scenarios are run on both
  directions, i.e. starting from both sides).
- The initial state of both the local and remote trees (for now there is now
  way to start for an unsynchronized state).
- Actions performed by user on one side (will be either the restricted one if
  any, or both in 2 consecutive runs).
- Expectations regarding:
  - The final tree on both sides (there was some work to allow expecting
    different trees on both sides, but it doesn't worked so well; but one
    should still be able to use the above side restriction to write 2 separate
    scenarios).
  - The trash content (**WARNING**: only the remote trash is checked currently)
  - The calls to `core/prep.js` (**WARNING**: those expectations are currently
    not verified; This is pretty low-level stuff anyway).

The schema of scenarios is described as flow type definitions in
`test/scenarios/index.js` (which means they are typechecked).

## Captures

In order for scenarios to be determinist, we introduced a way to set up their
initial state and perform a dry run in any direction to capture either the FS
events (as provided by chokidar) or the remote changesfeed, without verifying
their expectations.

The main script is `yarn capture`, see `-h` option and examples below.

### Capturing local FS events

```bash
yarn capture -l `test/scenarios/<scenario_name>/`
```

Local FS event are stored in
`test/scenarios/<scenario_name>/local/<capture_name>.json` files.

The default file name will be the current platform (as in Node's
`process.platform`).

### Capturing remote changesfeed (see WARNING)

```bash
yarn capture -l `test/scenarios/<scenario_name>/`
```

Remote changesfeed captures are stored in
`test/scenarios/<scenario_name>/remote/<capture_name>.json` files.

The default file name will be `changes.json`.

**WARNING**: the remote captures are actually not used currently, meaning
remote scenario runs are not determinist (while local ones are).

### Capturing manual user actions (local only)

One can also capture manual user actions (e.g. move-overwrite some directory
in a file manager to get the exact same FS events). See `yarn capture:manual`.
There is no support to save the events in a capture file yet.

## Running scenarios

### Running all scenarios

To run all scenarios (**WARNING**: this takes quite a lot of time):

```bash
yarn test:scenarios
```

### Running one or only a few scenarios

Since generated test names match the path to the currently run local case file
or remote dir, one can use mocha's `-g` to run only one or a few matching
scenarios:

```bash
yarn test:scenarios -g test/scenarios/change_file/
```

## Using BASH's completion

Since all key parts of scenarios are in separate files, one can lean on BASH's
(or any other shell's) completion to easily capture or run scenarios:

```bash
yarn test:scenarios -g te<TAB>
yarn test:scenarios -g test/sc<TAB>
yarn test:scenarios -g test/scenarios/ch<TAB>
yarn test:scenarios -g test/scenarios/change_file/
```

- Stopping to some scenario prefix, e.g. `test/scenarios/move_`, will run all
  the matching scenarios.
- Stopping to the scenario dir will run both local & remote tests for the
  corresponding scenario.
- Stopping to the `local/` subdir will run all locally captured cases
- Stopping to the `remote/` dir will run the scenario actions from the remote
  side (remember remote captures are not used yet, so while stopping to the
  `remote/changes.json` file will run the scenario, the capture will still not
  be used)

The same works for captures, except you'll always stop to the scenario dir or
file.

## Flush variants

Since local events are buffered, in some rare cases events belonging to the
same move action can be flushed separately. In order to cover as much of those
cases as possible, captured local events can actually be used to generate many
flushing cases:

Unless configured otherwise, a single capture will be run in as many tests as
it has events:

1. Flush all events at once
2. Flush 1st event, then the remaining ones
3. Flush 2 events, then the remaining ones
4. etc...

Since not all cases are currently supported, one can define which ones are by
manually adding a special first event in the capture file:

```js
[
    {"breakpoints": [0, 3]}
]
```

In which case only the corresponding flushing cases will be tested:

1. Flush all events at once (`0`)
2. Flush first `3` events, then the remaining ones

## Stopped client

There is some instrumentation code to simulate user actions while the client
is not running in order to ensure the initial scan is still able to identify
changes, but those are disabled because to many tests are currently failing.

This should be fixed soon.

## Disabled scenarios

Some scenarios can be partially or completely unsupported through the
`.disabled` property of the `Scenario` object (in the `scenario.js` file):

- A *string* value explains why the scenario is completely unsupported.
- An *object* value, relative paths to the disabled capture files (without the
  `*.json` extension) as keys, *string* as values explaining why each capture
  is currently disabled.

Some disabled scenarios actually work locally but are currently failing on CI.

### Debugging scenarios with test logs

```bash
env DEBUG=1 yarn test:scenarios -b ...
```

This will generate a `./debug.log` file. You will generally run only one
scenario at a time with `DEBUG`, or eventually many with mocha's `-b` option.

You can then inspect the logs to better understand what went wrong:

```bash
yarn -s jq -c 'info|short' debug.log
```

See `doc/developer/log_analysis.md` for more details.

On CI, failing test logs are dumped in the console so you can copy-paste them
in a new text file and analyse them with the usual tools (instead of having a
hard time to reproduce the issue locally).

## Scenarios instrumentation

Currently the code that instruments scenarios is quite messy:

- `test/scenarios/run.js` is a big ball of mud
- `test/support/helpers/scenarios.js` provides the full scenarios list,
  initial state setup, local captures loading & local actions running.
- `dev/capture/remote.js` provides remote actions running.
- Many parts in the instrumentation code are duplicated.

Everything should be cleaned up soon.
