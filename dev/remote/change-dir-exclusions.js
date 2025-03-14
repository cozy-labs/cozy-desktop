require('../../core/globals')
const path = require('path')

const { app } = require('electron')
const _ = require('lodash')
const treeify = require('treeify')
const yargs = require('yargs')

const { default: CozyClient, Q } = require('cozy-client')

const { Config } = require('../../core/config')
const {
  DIR_TYPE,
  FILES_DOCTYPE,
  OAUTH_CLIENTS_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID
} = require('../../core/remote/constants')

const args = (argv /*: Array<*> */ = process.argv) => {
  const config = yargs
    .env('Change directory exclusions')
    .usage('$0 [--list] [--add <directories>] [--remove <directories>]')
    .options({
      a: {
        alias: 'add',
        describe:
          'list directories to be excluded from the synchronization (directories already excluded will be ignored',
        type: 'array',
        requiresArg: true,
        default: []
      },
      r: {
        alias: 'remove',
        describe:
          'list directories to be re-included in the synchronization (directories already included will be ignored',
        type: 'array',
        requiresArg: true,
        default: []
      },
      l: {
        alias: 'list',
        describe:
          'list current directories and their exclusion state (i.e. True or False)'
      }
    })
    .help()
    .parse(argv)

  return config
}

async function changeDirExclusions(context, { add, remove }) {
  const { client } = context
  const addedDirs = await client.query(
    Q(FILES_DOCTYPE).where({ path: { $in: add } })
  )
  const removedDirs = await client.query(
    Q(FILES_DOCTYPE).where({ path: { $in: remove } })
  )

  const oauthClient = {
    _id: getClientId(context),
    _type: OAUTH_CLIENTS_DOCTYPE
  }
  const files = client.collection(FILES_DOCTYPE)
  await files.addNotSynchronizedDirectories(oauthClient, addedDirs.data)
  await files.removeNotSynchronizedDirectories(oauthClient, removedDirs.data)
}

function getClientId(context) {
  return context.config.client.clientID
}

function isExcludedFromSync(context, not_synchronized_on = []) {
  return not_synchronized_on.find(c => c.id === getClientId(context)) != null
}

async function getDirectoryContent(context) {
  const { client } = context
  const dir = { _id: ROOT_DIR_ID, path: '/', name: '/' }
  const dirContent = { [dir.name]: {} }
  let resp /*: { next: boolean, bookmark?: string, data: Object[] } */ = {
    next: true,
    data: []
  }
  while (resp && resp.next) {
    const queryDef = Q(FILES_DOCTYPE)
      .where({
        type: DIR_TYPE,
        name: {
          $ne: ''
        },
        _id: {
          $ne: TRASH_DIR_ID
        }
      })
      .indexFields(['path', 'name', '_id'])
      .sortBy([{ path: 'asc' }])
      .limitBy(10000)
      .offsetBookmark(resp.bookmark)

    resp = await client.query(queryDef)

    for (const j of resp.data) {
      const {
        attributes: { path: dirPath, name, not_synchronized_on },
        _deleted
      } = j
      if (_deleted) continue

      const parentPath = path
        .dirname(dirPath)
        .split('/')
        .slice(1)
        .join('.')
      const key = parentPath === '' ? dir.name : `${dir.name}.${parentPath}`
      const parent = _.get(dirContent, key)
      if (!parent) continue

      if (isExcludedFromSync(context, not_synchronized_on)) {
        parent[`${name} (EXCLUDED)`] = {}
      } else {
        parent[name] = {}
      }
    }
  }
  return dirContent
}

async function showTree(context) {
  const tree = await getDirectoryContent(context)
  // eslint-disable-next-line no-console
  console.log(treeify.asTree(tree))
}

app
  .whenReady()
  .then(async () => {
    const { COZY_DESKTOP_DIR } = process.env

    const config = new Config(path.resolve(COZY_DESKTOP_DIR, '.cozy-desktop'))
    const client = new CozyClient({
      uri: config.cozyUrl,
      oauth: config.client,
      token: config.oauthTokens,
      scope: config.oauthTokens.scope,
      throwFetchErrors: true
    })
    const context = { client, config }

    const { list, add, remove } = args()
    if (list || (add.length === 0 && remove.length === 0)) {
      await showTree(context)
      return
    } else {
      await changeDirExclusions(context, { add, remove })
      // eslint-disable-next-line no-console
      console.log('Exclusions changed.')
      return
    }
  })
  .then(() => {
    return app.exit(0) // eslint-disable-line no-process-exit
  })
  .catch(err => {
    if (err.message === 'Device not configured') {
      // eslint-disable-next-line no-console
      console.log('\nYou need to register a dev client first.\n')
    } else {
      // eslint-disable-next-line no-console
      console.error(err)
    }
    app.exit(1)
  })
