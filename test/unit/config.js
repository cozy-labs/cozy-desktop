/* eslint-env mocha */

const path = require('path')
const should = require('should')
const fse = require('fs-extra')
const configHelpers = require('../support/helpers/config')
const { COZY_URL } = require('../support/helpers/cozy')

const config = require('../../core/config')

describe('core/config', function() {
  describe('.Config', () => {
    beforeEach('instanciate config', configHelpers.createConfig)
    afterEach('clean config directory', configHelpers.cleanConfig)

    describe('read', function() {
      context('when a tmp config file exists', function() {
        beforeEach('create tmp config file', function() {
          fse.ensureFileSync(this.config.tmpConfigPath)
        })
        afterEach('remove tmp config file', function() {
          if (fse.existsSync(this.config.tmpConfigPath)) {
            fse.unlinkSync(this.config.tmpConfigPath)
          }
        })

        context('and it has a valid JSON content', function() {
          const fileConfig = { url: 'https://cozy.test/' }

          beforeEach('write valid content', function() {
            fse.writeFileSync(
              this.config.tmpConfigPath,
              JSON.stringify(fileConfig, null, 2)
            )
          })

          it('reads the tmp config', function() {
            should(this.config.read()).match(fileConfig)
          })

          it('persists the tmp config file as the new config file', function() {
            this.config.read()

            const fileConfigPersisted = fse.readJSONSync(this.config.configPath)
            should(fileConfigPersisted).match(fileConfig)
          })
        })

        context('and it does not have a valid JSON content', function() {
          beforeEach('write invalid content', function() {
            fse.writeFileSync(this.config.tmpConfigPath, '\0')
            this.config.persist()
          })

          it('reads the existing config', function() {
            const fileConfig = this.config.read()
            should(fileConfig).be.an.Object()
            should(fileConfig.url).eql(COZY_URL)
          })
        })
      })

      context('when no tmp config files exist', function() {
        beforeEach('remove any tmp config file', function() {
          if (fse.existsSync(this.config.tmpConfigPath)) {
            fse.unlinkSync(this.config.tmpConfigPath)
          }
          this.config.persist()
        })

        it('reads the existing config', function() {
          const fileConfig = this.config.read()
          should(fileConfig).be.an.Object()
          should(fileConfig.url).eql(COZY_URL)
        })
      })

      context('when the read config is empty', function() {
        beforeEach('empty local config', function() {
          fse.ensureFileSync(this.config.configPath)
          fse.writeFileSync(this.config.configPath, '')
        })

        it('creates a new empty one', function() {
          const fileConfig = this.config.read()
          should(fileConfig).be.an.Object()
          should(fileConfig).be.empty()
        })
      })
    })

    describe('safeLoad', function() {
      context('when the file content is valid JSON', function() {
        const fileConfig = { url: 'https://cozy.test/' }

        beforeEach('write valid content', function() {
          fse.writeFileSync(
            this.config.configPath,
            JSON.stringify(fileConfig, null, 2)
          )
        })

        it('returns an object matching the file content', function() {
          const newFileConfig = config.loadOrDeleteFile(this.config.configPath)
          newFileConfig.should.be.an.Object()
          newFileConfig.url.should.eql(fileConfig.url)
        })
      })

      context('when the file does not exist', function() {
        beforeEach('remove config file', function() {
          if (fse.existsSync(this.config.configPath)) {
            fse.unlinkSync(this.config.configPath)
          }
        })

        it('throws an error', function() {
          ;(() => {
            config.loadOrDeleteFile(this.config.configPath)
          }).should.throw()
        })
      })

      context('when the file is empty', function() {
        beforeEach('create empty file', function() {
          fse.writeFileSync(this.config.configPath, '')
        })

        it('returns an empty object', function() {
          should(config.loadOrDeleteFile(this.config.configPath)).deepEqual({})
        })

        it('does not delete it', function() {
          config.loadOrDeleteFile(this.config.configPath)
          should(fse.existsSync(this.config.configPath)).be.true()
        })
      })

      context('when the file content is not valid JSON', function() {
        beforeEach('write invalid content', function() {
          fse.writeFileSync(this.config.configPath, '\0')
        })

        it('does not throw any errors', function() {
          ;(() => {
            config.loadOrDeleteFile(this.config.configPath)
          }).should.not.throw()
        })

        it('returns an empty object', function() {
          should(config.loadOrDeleteFile(this.config.configPath)).deepEqual({})
        })

        it('deletes the file', function() {
          fse.existsSync(this.config.configPath).should.be.true()
          config.loadOrDeleteFile(this.config.configPath)
          fse.existsSync(this.config.configPath).should.be.false()
        })
      })
    })

    describe('persist', function() {
      it('saves last changes made on the config', function() {
        const url = 'http://cozy.local:8080/'
        this.config.cozyUrl = url
        this.config.persist()
        const configLoaded = config.load(path.dirname(this.config.configPath))
        should(configLoaded.cozyUrl).equal(url)
      })
    })

    describe('SyncPath', function() {
      it('returns the set sync path', function() {
        this.config.syncPath = '/path/to/sync/dir'
        should(this.config.syncPath).equal('/path/to/sync/dir')
      })
    })

    describe('CozyUrl', function() {
      it('returns the set Cozy URL', function() {
        this.config.cozyUrl = 'https://cozy.example.com'
        should(this.config.cozyUrl).equal('https://cozy.example.com')
      })
    })

    describe('gui', () => {
      it('returns an empty hash by default', function() {
        should(this.config.gui).deepEqual({})
      })

      it('returns GUI configuration if any', function() {
        const guiConfig = { foo: 'bar' }
        this.config.fileConfig.gui = guiConfig
        should(this.config.gui).deepEqual(guiConfig)
      })
    })

    describe('Client', function() {
      it('can set a client', function() {
        this.config.client = { clientName: 'test' }
        should(this.config.isValid()).be.true()
        should(this.config.client.clientName).equal('test')
      })

      it('has no client after a reset', function() {
        this.config.reset()
        should(this.config.isValid()).be.false()
      })
    })

    describe('#watcherType', function() {
      it('returns valid watcher type from file config if any', function() {
        this.config.fileConfig.watcherType = 'atom'
        should(this.config.watcherType).equal('atom')
      })

      it('is the same as core/config.watcherType() otherwise', function() {
        should(this.config.watcherType).equal(config.watcherType())
      })
    })

    describe('saveMode', function() {
      it('sets the pull or push mode', function() {
        this.config.saveMode('push')
        should(this.config.fileConfig.mode).equal('push')
      })

      it('throws an error for incompatible mode', function() {
        this.config.saveMode('push')
        should.throws(() => this.config.saveMode('pull'), /you cannot switch/)
        should.throws(() => this.config.saveMode('full'), /you cannot switch/)
      })
    })
  })

  describe('.watcherType()', () => {
    const { platform } = process

    describe('when valid in file config', () => {
      const fileConfig = { watcherType: 'atom' }

      it('is the file config value', () => {
        should(config.watcherType(fileConfig)).equal(fileConfig.watcherType)
      })
    })

    describe('when invalid in file config', () => {
      const fileConfig = { watcherType: 'invalid' }

      it('is the same as when no file config', () => {
        should(config.watcherType(fileConfig)).equal(config.watcherType({}))
      })
    })

    describe('when missing in file config', () => {
      const fileConfig = {}

      describe('with valid COZY_FS_WATCHER env var', () => {
        const env = { COZY_FS_WATCHER: 'chokidar' }

        it('is the COZY_FS_WATCHER value', () => {
          should(config.watcherType(fileConfig, { env, platform })).equal(
            env.COZY_FS_WATCHER
          )
        })
      })

      describe('with invalid COZY_FS_WATCHER env var', () => {
        const env = { COZY_FS_WATCHER: 'invalid' }

        it('is the default for the current platform', () => {
          should(config.watcherType(fileConfig, { env, platform })).equal(
            config.platformDefaultWatcherType(platform)
          )
        })
      })

      describe('with missing COZY_FS_WATCHER env var', () => {
        const env = {}

        it('is the default for the current platform', () => {
          should(config.watcherType(fileConfig, { env, platform })).equal(
            config.platformDefaultWatcherType(platform)
          )
        })
      })
    })
  })

  describe('.environmentWatcherType()', () => {
    it('depends on the environment', () => {
      should(config.environmentWatcherType()).equal(
        config.environmentWatcherType(process.env)
      )
    })

    describe('when COZY_FS_WATCHER is valid', () => {
      for (const COZY_FS_WATCHER of ['atom', 'chokidar']) {
        it(`returns COZY_FS_WATCHER when set to ${JSON.stringify(
          COZY_FS_WATCHER
        )}`, () => {
          const watcherType = config.environmentWatcherType({ COZY_FS_WATCHER })
          should(watcherType).equal(COZY_FS_WATCHER)
        })
      }
    })

    describe('when COZY_FS_WATCHER is invalid or missing', () => {
      for (const COZY_FS_WATCHER of ['invalid', '', ' ', undefined]) {
        it(`is null when COZY_FS_WATCHER is set to ${JSON.stringify(
          COZY_FS_WATCHER
        )}`, () => {
          const watcherType = config.environmentWatcherType({ COZY_FS_WATCHER })
          should(watcherType).be.null()
        })
      }
    })
  })

  describe('.platformDefaultWatcherType()', () => {
    it('depends on the platform', () => {
      should(config.platformDefaultWatcherType()).equal(
        config.platformDefaultWatcherType(process.platform)
      )
    })

    it('is atom on Windows', () => {
      should(config.platformDefaultWatcherType('win32')).equal('atom')
    })

    it('is atom on macOS', () => {
      should(config.platformDefaultWatcherType('darwin')).equal('atom')
    })

    it('is atom on Linux', () => {
      should(config.platformDefaultWatcherType('linux')).equal('atom')
    })
  })
})
