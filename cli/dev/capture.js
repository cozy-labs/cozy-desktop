#!/usr/bin/env babel-node

import local from './event_recorders/local'

local.runAllScenarios()
  .then(() => { console.log('Done with all scenarios.')})
  .catch(error => console.error({error}))
