var Button, Container, Field, Folder, Help, InfoLine, Line, Subtitle, Title, a, button, div, h1, h2, img, input, label, p, span, _ref;

_ref = React.DOM, div = _ref.div, p = _ref.p, img = _ref.img, span = _ref.span, a = _ref.a, label = _ref.label, input = _ref.input, h1 = _ref.h1, h2 = _ref.h2, button = _ref.button;

Line = React.createClass({
  render: function() {
    var className;
    className = this.props.className;
    if (className == null) {
      className = 'mtl';
    }
    return div({
      className: "line clearfix " + className
    }, this.props.children);
  }
});

Container = React.createClass({
  render: function() {
    var className;
    className = 'container ';
    if (this.props.className) {
      className += this.props.className;
    }
    return div({
      className: className
    }, this.props.children);
  }
});

Title = React.createClass({
  render: function() {
    return Line(null, div({
      className: "title"
    }, h1({
      ref: this.props.ref
    }, img({
      id: 'help',
      src: 'client/public/icon/happycloud.png'
    }), this.props.text)));
  }
});

Subtitle = React.createClass({
  render: function() {
    return h2({}, this.props.text);
  }
});

Button = React.createClass({
  render: function() {
    return button({
      className: "btn btn-cozy " + this.props.className,
      ref: this.props.ref,
      onClick: this.props.onClick
    }, this.props.text);
  }
});

Field = React.createClass({
  getInitialState: function() {
    return {
      error: null
    };
  },
  render: function() {
    var _base;
    if ((_base = this.props).type == null) {
      _base.type = 'text';
    }
    return Line(null, label({
      className: 'mod w100 mrm'
    }, this.props.label), input({
      type: this.props.type,
      className: "mt1 " + this.props.fieldClass,
      ref: this.props.inputRef,
      defaultValue: this.props.defaultValue,
      onChange: this.onChange,
      onClick: this.props.onClick,
      onKeyUp: this.props.onKeyUp,
      placeholder: this.props.placeholder,
      id: this.props.inputId
    }), this.state.error ? p({
      className: 'error'
    }, this.state.error) : void 0);
  },
  getValue: function() {
    return this.refs[this.props.inputRef].getDOMNode().value;
  },
  setValue: function(val) {
    return this.refs[this.props.inputRef].getDOMNode().value = val;
  },
  isValid: function() {
    return this.getValue() !== '';
  },
  setError: function(err) {
    return this.setState({
      error: t(err)
    });
  },
  getError: function() {
    return 'value is missing';
  },
  onChange: function() {
    var val;
    val = this.refs[this.props.inputRef].getDOMNode().value;
    if (val === '') {
      this.setState({
        error: t(this.getError())
      });
    } else {
      this.setState({
        error: null
      });
    }
    return this.props.onChange();
  }
});

Help = React.createClass({
  getInitialState: function() {
    return {
      error: null
    };
  },
  render: function() {
    var _base;
    if ((_base = this.props).type == null) {
      _base.type = 'text';
    }
    return Line(null, label({
      className: 'mod w100 mrm'
    }, this.props.label), input({
      type: this.props.type,
      className: "mt1 " + this.props.fieldClass,
      ref: this.props.inputRef,
      defaultValue: this.props.defaultValue,
      value: this.props.value,
      onChange: this.onChange,
      onKeyUp: this.props.onKeyUp,
      placeholder: this.props.placeholder,
      id: this.props.inputId
    }), button({
      className: "btn help",
      onMouseOver: this.props.onMouseOver,
      onMouseLeave: this.props.onMouseLeave
    }, img({
      id: 'help',
      src: 'client/public/icon/help.png'
    })), this.state.description ? p({
      className: 'description'
    }, this.state.description) : void 0, this.state.error ? p({
      className: 'error'
    }, this.state.error) : void 0);
  },
  getValue: function() {
    return this.refs[this.props.inputRef].getDOMNode().value;
  },
  setValue: function(val) {
    return this.refs[this.props.inputRef].getDOMNode().value = val;
  },
  displayDescription: function(desc) {
    return this.setState({
      description: t(desc)
    });
  },
  unDisplayDescription: function() {
    return this.setState({
      description: null
    });
  },
  isValid: function() {
    return this.getValue() !== '';
  },
  setError: function(err) {
    return this.setState({
      error: t(err)
    });
  },
  getError: function() {
    return 'value is missing';
  },
  onChange: function() {
    var val;
    val = this.refs[this.props.inputRef].getDOMNode().value;
    if (val === '') {
      this.setState({
        error: t(this.getError())
      });
    } else {
      this.setState({
        error: null
      });
    }
    return this.props.onChange();
  }
});

Folder = React.createClass({
  getInitialState: function() {
    return {
      error: null,
      value: null
    };
  },
  render: function() {
    var _base;
    if ((_base = this.props).type == null) {
      _base.type = 'text';
    }
    return Line(null, label({
      className: 'mod w100 mrm'
    }, this.props.label), button({
      className: 'btn btn-cozy folder'
    }, this.state.value ? this.state.value : this.props.text, input({
      type: this.props.type,
      className: "mt1 " + this.props.fieldClass,
      ref: this.props.inputRef,
      defaultValue: this.props.defaultValue,
      value: this.props.value,
      onChange: this.onChange,
      onKeyUp: this.props.onKeyUp,
      placeholder: this.props.placeholder,
      id: this.props.inputId
    })), button({
      className: "btn help",
      onMouseOver: this.props.onMouseOver,
      onMouseLeave: this.props.onMouseLeave
    }, img({
      id: 'help',
      src: 'client/public/icon/help.png'
    })), this.state.description ? p({
      className: 'description'
    }, this.state.description) : void 0, this.state.error ? p({
      className: 'error'
    }, this.state.error) : void 0);
  },
  getValue: function() {
    return this.refs[this.props.inputRef].getDOMNode().value;
  },
  setValue: function(val) {
    return this.refs[this.props.inputRef].getDOMNode().value = val;
  },
  displayDescription: function(desc) {
    return this.setState({
      description: t(desc)
    });
  },
  unDisplayDescription: function() {
    return this.setState({
      description: null
    });
  },
  isValid: function() {
    return this.getValue() !== '';
  },
  setError: function(err) {
    return this.setState({
      error: t(err)
    });
  },
  getError: function() {
    return 'value is missing';
  },
  onChange: function() {
    var length, val;
    val = this.refs[this.props.inputRef].getDOMNode().value;
    if (val === '') {
      this.setState({
        error: t(this.getError())
      });
      this.setState({
        value: t('select folder')
      });
    } else {
      if (val.length > 30) {
        length = val.length;
        val = "..." + val.substring(length - 27, length);
      }
      this.setState({
        error: null
      });
      this.setState({
        value: val
      });
    }
    return this.props.onChange();
  }
});

InfoLine = React.createClass({
  render: function() {
    return Line({
      className: 'parameter'
    }, span({
      className: "parameter label"
    }, "" + this.props.label + " :"), Line({
      className: 'parameter value'
    }, span(null, this.props.value), this.props.text ? button({
      className: "btn btn-cozy smaller " + this.props.className,
      onClick: this.props.onClick
    }, this.props.text) : void 0));
  }
});
;var config, configDir, configHelpers, configPath, device, fs, homedir, keys, path;

path = require('path-extra');

fs = require('fs-extra');

homedir = path.homedir();

configDir = path.join(homedir, '.cozy-desktop');

configPath = path.join(configDir, 'config.json');

fs.ensureDirSync(configDir);

fs.ensureFileSync(configPath);

if (fs.readFileSync(configPath).toString() === '') {
  fs.writeFileSync(configPath, JSON.stringify({
    devices: {}
  }, null, 2));
}

config = require(configPath || {
  devices: {}
});

keys = Object.keys(config.devices);

if (keys.length > 0) {
  device = config.devices[keys[0]];
}

if (device == null) {
  device = {};
}

configHelpers = {
  saveConfigSync: function(deviceConfig) {
    var key, value;
    delete config.devices[device.deviceName];
    for (key in deviceConfig) {
      value = deviceConfig[key];
      device[key] = deviceConfig[key];
    }
    config.devices[device.deviceName] = device;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return console.log('Configuration file successfully updated');
  },
  getState: function() {
    if (device.deviceName == null) {
      return 'INTRO';
    } else if (device.path == null) {
      return 'STEP1';
    } else if ((device.url == null) || (device.deviceId == null)) {
      return 'STEP2';
    } else {
      return 'STATE';
    }
  }
};
;var StateView;

StateView = React.createClass({
  getInitialState: function() {
    return {
      logs: [],
      sync: false
    };
  },
  render: function() {
    var i, log, logs, state, syncButtonLabel, _i, _len, _ref;
    logs = [];
    if (this.state.logs.length === 0) {
      logs.push(Line({
        className: 'smaller'
      }, 'nothing to notice...'));
    } else {
      i = 0;
      _ref = this.state.logs;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        log = _ref[_i];
        logs.push(Line({
          key: "log-" + (i++),
          className: 'smaller'
        }, log));
      }
      logs.reverse();
      if (logs.length > 6) {
        logs = logs.slice(0, 6);
      }
    }
    if (this.state.sync) {
      state = t('on');
      syncButtonLabel = t('stop sync');
    } else {
      state = t('off');
      syncButtonLabel = t('start sync');
    }
    return Container({
      className: 'line'
    }, Title({
      text: 'Cozy Desktop'
    }), Container({
      className: 'mod parameters'
    }, Subtitle({
      text: t('parameters')
    }), InfoLine({
      label: t('path'),
      value: device.path,
      text: t('open folder'),
      onClick: this.onOpenFolder
    }), InfoLine({
      label: t('url'),
      value: device.url,
      text: t('open url'),
      onClick: this.onOpenUrl
    }), InfoLine({
      label: t('sync state'),
      value: state,
      text: syncButtonLabel,
      onClick: this.onSyncClicked
    }), InfoLine({
      label: t('device name'),
      value: device.deviceName,
      text: t('delete configuration'),
      onClick: this.onDeleteConfigurationClicked
    })), Line({
      className: 'modifications'
    }, Subtitle({
      text: t('last changes')
    }), logs));
  },
  onSyncClicked: function() {
    return this.sync({
      force: false
    });
  },
  sync: function(options) {
    var gui, localEventWatcher, notifier, open, pouch, publisher, remoteEventWatcher;
    notifier = require('node-notifier');
    remoteEventWatcher = require('./backend/remoteEventWatcher');
    localEventWatcher = require('./backend/localEventWatcher');
    publisher = require('./backend/publisher');
    pouch = require('./backend/db');
    gui = require('nw.gui');
    open = require('open');
    if (this.state.sync) {
      this.setState({
        sync: false
      });
      remoteEventWatcher.cancel();
      this.displayLog('Synchronization is off');
      notifier.notify({
        title: 'Synchronization has been stopped',
        icon: 'client/public/icon/bighappycloud.png'
      });
      return menu.items[10].label = t('start sync');
    } else {
      this.displayLog('Synchronization is on...');
      this.displayLog('First synchronization can take a while to init...');
      this.setState({
        sync: true
      });
      menu.items[10].label = t('stop sync');
      notifier.notify({
        title: 'Synchronization is on',
        message: 'First synchronization can take a while to init',
        icon: 'client/public/icon/bighappycloud.png'
      });
      tray.icon = 'client/public/icon/icon_sync.png';
      pouch.addAllFilters(function() {
        localEventWatcher.start();
        return remoteEventWatcher.start();
      });
      publisher.on('firstSyncDone', (function(_this) {
        return function() {
          tray.icon = 'client/public/icon/icon.png';
          return _this.displayLog("Successfully synchronized");
        };
      })(this));
      publisher.on('downloadingRemoteChanges', (function(_this) {
        return function() {
          return _this.displayLog('Downloading missing files from remote...');
        };
      })(this));
      publisher.on('binaryDownloadStdebug', (function(_this) {
        return function(path) {
          tray.icon = 'client/public/icon/icon_sync.png';
          return _this.displayLog("File " + path + " is downloading...");
        };
      })(this));
      publisher.on('binaryDownloaded', (function(_this) {
        return function(path) {
          tray.icon = 'client/public/icon/icon.png';
          _this.displayLog("File " + path + " downloaded");
          return _this.fileModification(path);
        };
      })(this));
      publisher.on('applyingChanges', (function(_this) {
        return function() {
          return tray.icon = 'client/public/icon/icon_sync.png';
        };
      })(this));
      publisher.on('changesApplied', (function(_this) {
        return function() {
          return tray.icon = 'client/public/icon/icon.png';
        };
      })(this));
      publisher.on('fileDeleted', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " deleted");
        };
      })(this));
      publisher.on('fileMoved', (function(_this) {
        return function(info) {
          var newPath, previousPath;
          previousPath = info.previousPath, newPath = info.newPath;
          _this.displayLog("File moved: " + previousPath + " -> " + newPath);
          return _this.fileModification(newPath);
        };
      })(this));
      publisher.on('folderDeleted', (function(_this) {
        return function(path) {
          return _this.displayLog("Folder " + path + " deleted");
        };
      })(this));
      publisher.on('folderMoved', (function(_this) {
        return function(info) {
          var newPath, previousPath;
          previousPath = info.previousPath, newPath = info.newPath;
          return _this.displayLog("Folder moved: " + previousPath + " -> " + newPath);
        };
      })(this));
      publisher.on('uploadingLocalChanges', (function(_this) {
        return function() {
          return _this.displayLog('Uploading modifications to remote...');
        };
      })(this));
      publisher.on('uploadBinary', (function(_this) {
        return function(path) {
          tray.icon = 'client/public/icon/icon_sync.png';
          return _this.displayLog("File " + path + " is uploading...");
        };
      })(this));
      publisher.on('binaryUploaded', (function(_this) {
        return function(path) {
          tray.icon = 'client/public/icon/icon.png';
          _this.displayLog("File " + path + " uploaded");
          return _this.fileModification(path);
        };
      })(this));
      publisher.on('fileAddedLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " locally added");
        };
      })(this));
      publisher.on('fileDeletedLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " locally deleted");
        };
      })(this));
      publisher.on('fileDeletedLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " locally deleted");
        };
      })(this));
      publisher.on('fileModificationLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " locally changed");
        };
      })(this));
      publisher.on('folderAddedLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("Folder " + path + " locally added");
        };
      })(this));
      return publisher.on('folderDeletedLocally', (function(_this) {
        return function(path) {
          return _this.displayLog("Folder " + path + " locally deleted");
        };
      })(this));
    }
  },
  displayLog: function(log) {
    var length, logs, moment;
    logs = this.state.logs;
    moment = require('moment');
    this.setState({
      logs: logs
    });
    tray.tooltip = log;
    if (log.length > 70) {
      length = log.length;
      if (log.substring(0, 2) === "Fi") {
        log = "File ..." + log.substring(length - 67, length);
      } else {
        log = "Folder ..." + log.substring(length - 67, length);
      }
    }
    logs.push(moment().format('HH:MM:SS ') + log);
    if (log.length > 40) {
      length = log.length;
      log = "..." + log.substring(length - 37, length);
    }
    return menu.items[5].label = log;
  },
  fileModification: function(file) {
    var modMenu;
    modMenu = menu.items[6].submenu;
    modMenu.insert(new gui.MenuItem({
      type: 'normal',
      label: file,
      click: function() {
        return open(file);
      }
    }));
    if (modMenu.items.length > 12) {
      return modMenu.removeAt(modMenu.items.length - 3);
    }
  },
  onDeleteConfigurationClicked: function() {
    var config, fs, remoteEventWatcher;
    if (confirm('Are you sure?')) {
      remoteEventWatcher = require('./backend/remoteEventWatcher');
      config = require('./backend/config');
      fs = require('fs-extra');
      this.setState({
        sync: false
      });
      remoteEventWatcher.cancel();
      return fs.remove(configDir, function(err) {
        alert(t('Configuration deleted.'));
        tray.remove();
        return renderState('INTRO');
      });
    }
  },
  onDeleteFilesClicked: function() {
    var del;
    del = require('del');
    return del("" + device.path + "/*", {
      force: true
    }, function(err) {
      if (err) {
        console.log(err);
      }
      return alert(t('All files were successfully deleted.'));
    });
  },
  onOpenFolder: function() {
    return open(device.path);
  },
  onOpenUrl: function() {
    return open("" + device.url + "/apps/files");
  }
});
;var en;

en = {
  'cozy files configuration 2 on 2': 'Configure your device (2/2)',
  'cozy files configuration 1 on 2': 'Register your device (1/2)',
  'directory to synchronize your data': 'Synchronized folder:',
  'your device name': 'The device name:',
  'your remote url': 'The web URL of your Cozy',
  'your remote password': 'The password you use to connect to your Cozy:',
  'go back to previous step': '< Previous step',
  'save your device information and go to step 2': 'Save then go to next step >',
  'register device and synchronize': 'Register then go to next step >',
  'start configuring your device': 'Start to configure your device and sync your files',
  'welcome to the cozy desktop': 'Welcome to the Cozy Desktop, the module that syncs your computer with your Cozy!',
  'path': 'Path',
  'url': 'URL',
  'resync all': 'Resync All',
  'Laptop': 'Laptop',
  'select folder': 'Select your folder',
  'delete configuration': 'Delete configuration',
  'delete configuration and files': 'Delete configuration and files',
  'on': 'on',
  'off': 'off',
  'stop sync': 'Stop sync',
  'device name': 'Device name',
  'sync state': 'Sync state',
  'clear logs': 'Clear logs',
  'delete files': 'Delete files',
  'start sync': 'Start sync',
  'value is missing': 'A value is required for this field.',
  'bad credentials': "Cozy url and password don't correspond.",
  'not found': "Can you check your cozy url.",
  'device description': "The device name is used to sign up to your Cozy. You'll be able to manage your device access in your cozy via this name.",
  'path description': 'Path of the folder where you will see your cozy files',
  'device already used': "This device name is already used. Could you change it, please.",
  'first step text': "Prior to register your computer to your Cozy, we need information about it.",
  'second step text': "It's time to register your computer to your Cozy\n(your password won't be stored).",
  'last changes': 'Last changes',
  'parameters': 'Parameters',
  'open folder': 'Open folder',
  'open url': 'Access to your Cozy',
  'show logs': 'Show last logs',
  'refreshing available space': 'Refreshing available space...',
  'quit': 'Quit',
  'used': 'used',
  'synchronizing': 'Synchronizing...'
};
;var fr;

fr = {
  'cozy files configuration 2 on 2': 'Configuration de votre appareil (2/2)',
  'cozy files configuration 1 on 2': 'Enregistrer votre appareil (1/2)',
  'directory to synchronize your data': 'Dossier synchronisé :',
  'your device name': 'Nom de votre appareil :',
  'your remote url': "L'adresse de votre Cozy :",
  'your remote password': 'Le mot de passe de votre Cozy :',
  'go back to previous step': '〈 Etape précédente',
  'save your device information and go to step 2': "Sauvegarder puis aller à l'étape suivante 〉",
  'register device and synchronize': "Enregistrer puis aller à l'étape suivante 〉",
  'start configuring your device': 'Démarrer la configuration de votre appareil et synchroniser vos fichiers',
  'welcome to the cozy desktop': 'Bienvenue sur Cozy Desktop, le module qui vous permet de synchroniser votre ordinateur avec votre Cozy !',
  'path': 'Chemin',
  'url': 'URL',
  'Laptop': 'MonOrdinateur',
  'select folder': 'Sélectionnez votre dossier',
  'resync all': 'Tout resynchroniser',
  'delete configuration': 'Supprimer la configuration',
  'delete configuration and files': 'Suppression de la configuration et des fichiers',
  'on': 'En cours',
  'off': 'Arrêtée',
  'stop sync': 'Stopper la synchronisation',
  'device name': "Nom de l'appareil",
  'sync state': 'Synchronisation',
  'clear logs': 'Supprimer les logs',
  'delete files': 'Supprimer mes fichiers',
  'start sync': 'Démarrer la synchronisation',
  'value is missing': 'Une valeur est nécessaire pour ce champ.',
  'bad credentials': "L'adresse et le mot de passe de votre Cozy ne correspondent pas.",
  'not found': "Votre Cozy n'est pas accessible, veuillez vérifier son adresse.",
  'device description': "Exemple : 'MonOrdinateur', 'FixePerso', 'LaptopPro', ...\nLe nom de votre appareil permet de l'enregistrer auprès de votre Cozy. Cela vous permettra par la suite de gérer les accès de votre appareil dans l'interface de votre Cozy. ",
  'path description': 'Chemin du dossier où seront stockés les fichiers de votre Cozy.',
  'device already used': "Ce nom d'appareil est déjà utilisé pour un autre appareil. Veuillez en choisir un autre.",
  'first step text': "Nous allons pouvoir maintenant configurer votre appareil.",
  'second step text': "Enregistrer votre appareil auprès de votre Cozy. Votre mot de passe ne sera pas sauvegardé.",
  'last changes': 'Derniers changements',
  'parameters': 'Configuration',
  'open folder': 'Ouvrir le dossier',
  'open url': 'Accéder à votre Cozy',
  'show logs': 'Voir les derniers logs',
  'refreshing available space': "Récupération de l'espace disponible ...",
  'quit': 'Quitter',
  'used': 'utilisé',
  'synchronizing': "Synchronisation ..."
};
;var isValidForm;

isValidForm = function(fields) {
  var field, _i, _len;
  for (_i = 0, _len = fields.length; _i < _len; _i++) {
    field = fields[_i];
    if (!field.isValid()) {
      return false;
    }
  }
  return true;
};
;var config, displayTrayMenu, gui, open, remoteConfig;

gui = require('nw.gui');

open = require('open');

config = require('./backend/config');

remoteConfig = config.getConfig();

displayTrayMenu = function() {
  var lastModificationsMenu, setDiskSpace;
  this.tray = new gui.Tray({
    icon: 'client/public/icon/icon.png'
  });
  this.menu = new gui.Menu();
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('open url'),
    click: function() {
      return open("" + remoteConfig.url + "/apps/files");
    }
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: "" + (t('open folder')) + " : " + (path.basename(device.path)),
    click: function() {
      return open(device.path);
    }
  }));
  this.menu.append(new gui.MenuItem({
    type: 'separator'
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('refreshing available space'),
    enabled: false
  }));
  this.menu.append(new gui.MenuItem({
    type: 'separator'
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('synchronizing'),
    enabled: false
  }));
  lastModificationsMenu = new gui.Menu();
  lastModificationsMenu.append(new gui.MenuItem({
    type: 'separator'
  }));
  lastModificationsMenu.append(new gui.MenuItem({
    type: 'normal',
    label: t('show logs'),
    click: function() {
      return win.show();
    }
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('last changes'),
    submenu: lastModificationsMenu
  }));
  this.menu.append(new gui.MenuItem({
    type: 'separator'
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('parameters'),
    click: function() {
      return win.show();
    }
  }));
  this.menu.append(new gui.MenuItem({
    type: 'separator'
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('start sync'),
    click: (function(_this) {
      return function() {
        return currentComponent.onSyncClicked();
      };
    })(this)
  }));
  this.menu.append(new gui.MenuItem({
    type: 'normal',
    label: t('quit'),
    click: function() {
      return win.close(true);
    }
  }));
  this.tray.menu = this.menu;
  this.tray.on('click', function() {
    return win.show();
  });
  setDiskSpace = function() {
    return config.getDiskSpace((function(_this) {
      return function(err, res) {
        var percentage;
        if (res) {
          percentage = (res.diskSpace.usedDiskSpace / res.diskSpace.totalDiskSpace) * 100;
          return _this.menu.items[3].label = "" + (Math.round(percentage)) + "% of " + res.diskSpace.totalDiskSpace + "GB " + (t('used'));
        }
      };
    })(this));
  };
  return setInterval(function() {
    return setDiskSpace();
  }, 20000);
};
;var win;

win = gui.Window.get();

win.on('close', function() {
  return win.hide();
});
;var ConfigFormStepOne, ConfigFormStepTwo, Intro, cozyPassword, cozyUrl;

Intro = React.createClass({
  render: function() {
    return Container(null, div({
      className: 'intro txtcenter mtl'
    }, img({
      id: 'logo',
      src: 'client/public/icon/bighappycloud.png'
    }), p({
      className: 'mtl biggest'
    }, t('welcome to the cozy desktop')), Button({
      className: 'mtl bigger pam',
      onClick: this.onEnterClicked,
      text: t('start configuring your device')
    })));
  },
  onEnterClicked: function() {
    return renderState('STEP1');
  }
});

cozyUrl = "";

cozyPassword = "";

ConfigFormStepOne = React.createClass({
  getInitialState: function() {
    var isDeviceName, isPath;
    isDeviceName = (this.props.url != null) && this.props.url !== '';
    isPath = (this.props.path != null) && this.props.path !== '';
    return {
      validForm: isDeviceName && isPath
    };
  },
  render: function() {
    var buttonClass;
    buttonClass = 'right bottom';
    if (!this.state.validForm) {
      buttonClass += ' disabled';
    }
    return Container(null, Title({
      text: t('cozy files configuration 1 on 2')
    }), Line({
      className: 'explanation'
    }, p(null, t('second step text'))), Field({
      label: t('your remote url'),
      fieldClass: 'w300p',
      inputRef: 'remoteUrl',
      defaultValue: this.props.url,
      ref: 'remoteUrlField',
      placeholder: 'john.cozycloud.cc',
      onChange: this.onFieldChanged,
      onKeyUp: this.onUrlKeyUp
    }), Field({
      label: t('your remote password'),
      fieldClass: 'w300p',
      type: 'password',
      inputRef: 'remotePassword',
      defaultValue: this.props.remotePassword,
      ref: 'remotePasswordField',
      onChange: this.onFieldChanged,
      onKeyUp: this.onPasswordKeyUp,
      onClick: this.onCompleteUrl
    }), Line(null, Button({
      className: buttonClass,
      ref: 'nextButton',
      onClick: this.onSaveButtonClicked,
      text: t('register device and synchronize')
    })));
  },
  componentDidMount: function() {
    var node;
    node = this.refs.remoteUrlField.refs.remoteUrl.getDOMNode();
    return $(node).focus();
  },
  onFieldChanged: function() {
    var fieldPassword, fieldUrl;
    fieldUrl = this.refs.remoteUrlField;
    fieldPassword = this.refs.remotePasswordField;
    return this.setState({
      validForm: isValidForm([fieldUrl, fieldPassword])
    });
  },
  onUrlKeyUp: function(event) {
    var node;
    if (event.keyCode === 13) {
      node = this.refs.remotePasswordField.refs.remotePassword.getDOMNode();
      return $(node).focus();
    }
  },
  onCompleteUrl: function() {
    var fieldUrl;
    fieldUrl = this.refs.remoteUrlField.getValue();
    if (fieldUrl && fieldUrl.indexOf('.') === -1) {
      return this.refs.remoteUrlField.setValue(fieldUrl + ".cozycloud.cc");
    }
  },
  onPasswordKeyUp: function(event) {
    var fieldUrl;
    fieldUrl = this.refs.remoteUrlField;
    if (event.keyCode === 13) {
      this.onSaveButtonClicked();
    }
    this.onCompleteUrl();
    return fieldUrl.setError("");
  },
  onSaveButtonClicked: function() {
    var config, db, fieldPassword, fieldUrl, options, password, url;
    fieldUrl = this.refs.remoteUrlField;
    fieldPassword = this.refs.remotePasswordField;
    if (isValidForm([fieldUrl, fieldPassword])) {
      config = require('./backend/config');
      db = require('./backend/db');
      url = fieldUrl.getValue();
      if (url.indexOf('http') < 0) {
        url = "https://" + (fieldUrl.getValue());
      }
      password = fieldPassword.getValue();
      cozyUrl = url;
      cozyPassword = password;
      options = {
        url: url,
        password: password
      };
      return db.checkCredentials(options, function(err) {
        if (err && err === "getaddrinfo ENOTFOUND") {
          return fieldUrl.setError('not found');
        } else if (err != null) {
          return fieldUrl.setError("bad credentials");
        } else {
          return renderState('STEP2');
        }
      });
    }
  }
});

ConfigFormStepTwo = React.createClass({
  getInitialState: function() {
    var isDeviceName, isPath;
    isDeviceName = (this.props.deviceName != null) && this.props.deviceName !== '';
    isPath = (this.props.path != null) && this.props.path !== '';
    return {
      validForm: isDeviceName && isPath
    };
  },
  render: function() {
    var buttonClass;
    buttonClass = 'right bottom';
    if (!this.state.validForm) {
      buttonClass += ' disabled';
    }
    return Container(null, Title({
      text: t('cozy files configuration 2 on 2')
    }), Line({
      className: 'explanation'
    }, p(null, t('first step text'))), Help({
      label: t('your device name'),
      fieldClass: 'w300p',
      inputRef: 'deviceName',
      defaultValue: this.props.deviceName,
      ref: 'deviceNameField',
      onChange: this.onDeviceNameChanged,
      onMouseOver: this.onDisplayDevice,
      onMouseLeave: this.onUnDisplayDevice
    }), Folder({
      label: t('directory to synchronize your data'),
      fieldClass: 'w500p',
      inputRef: 'path',
      type: 'file',
      defaultValue: this.props.path,
      ref: 'devicePathField',
      inputId: 'folder-input',
      onChange: this.onPathChanged,
      onMouseOver: this.onDisplayPath,
      onMouseLeave: this.onUnDisplayPath,
      text: t('select folder')
    }), Line(null, Button({
      className: 'left',
      ref: 'backButton',
      onClick: this.onBackButtonClicked,
      text: t('go back to previous step')
    }), Button({
      className: buttonClass,
      onClick: this.onSaveButtonClicked,
      text: t('save your device information and go to step 2')
    })));
  },
  componentDidMount: function() {
    return this.refs.deviceNameField.setValue(t('Laptop'));
  },
  onDisplayDevice: function() {
    var fieldName;
    fieldName = this.refs.deviceNameField;
    return fieldName.displayDescription('device description');
  },
  onUnDisplayDevice: function() {
    var fieldName;
    fieldName = this.refs.deviceNameField;
    return fieldName.unDisplayDescription();
  },
  onDisplayPath: function() {
    var fieldPath;
    fieldPath = this.refs.devicePathField;
    return fieldPath.displayDescription('path description');
  },
  onUnDisplayPath: function() {
    var fieldPath;
    fieldPath = this.refs.devicePathField;
    return fieldPath.unDisplayDescription();
  },
  onBackButtonClicked: function() {
    return renderState('STEP1');
  },
  onDeviceNameChanged: function() {
    var fieldName, fieldPath;
    fieldName = this.refs.deviceNameField;
    fieldPath = this.refs.devicePathField;
    return this.setState({
      validForm: isValidForm([fieldName, fieldPath])
    });
  },
  onPathChanged: function(event, files, label) {
    var fieldName, fieldPath;
    fieldName = this.refs.deviceNameField;
    fieldPath = this.refs.devicePathField;
    return this.setState({
      validForm: isValidForm([fieldName, fieldPath])
    });
  },
  onSaveButtonClicked: function() {
    var config, db, fieldName, fieldPath, options, saveConfig;
    fieldName = this.refs.deviceNameField;
    fieldPath = this.refs.devicePathField;
    if (this.state.validForm) {
      config = require('./backend/config');
      db = require('./backend/db');
      config.updateSync({
        deviceName: fieldName.getValue(),
        path: fieldPath.getValue()
      });
      device.deviceName = fieldName.getValue();
      device.path = fieldPath.getValue();
      device.url = cozyUrl;
      saveConfig = function(err, credentials) {
        var options;
        if (err) {
          console.log(err);
          alert("An error occured while registering your device. " + err);
          return renderState('STEP1');
        } else {
          options = {
            url: cozyUrl,
            deviceId: credentials.id,
            devicePassword: credentials.password
          };
          config.updateSync(options);
          console.log('Remote Cozy properly configured to work ' + 'with current device.');
          return renderState('STATE');
        }
      };
      options = {
        url: cozyUrl,
        deviceName: device.deviceName,
        password: cozyPassword
      };
      return db.registerDevice(options, function(err, credentials) {
        if (err != null) {
          return fieldName.setError("device already used");
        } else {
          return saveConfig(err, credentials);
        }
      });
    }
  }
});
;var renderState;

renderState = function(state) {
  var getCurrentComponent;
  getCurrentComponent = function(state) {
    switch (state) {
      case 'INTRO':
        win.show();
        return Intro();
      case 'STEP1':
        win.show();
        return ConfigFormStepOne(device);
      case 'STEP2':
        win.show();
        return ConfigFormStepTwo(device);
      case 'STEP3':
        win.show();
        return ConfigFormStepThree(device);
      case 'STATE':
        displayTrayMenu();
        return StateView(device);
      default:
        win.show();
        return Intro();
    }
  };
  this.currentComponent = React.renderComponent(getCurrentComponent(state), document.body);
  if (state === 'STATE') {
    this.currentComponent.onSyncClicked();
  }
  if (state === 'STEP2') {
    return $("#folder-input").attr('nwdirectory', '');
  }
};

window.onload = function() {
  var locale, locales, polyglot;
  window.__DEV__ = window.location.hostname === 'localhost';
  locale = window.locale || window.navigator.language || "en";
  locales = {};
  polyglot = new Polyglot();
  locales = en;
  if (process.env.LANG.indexOf('fr') === 0) {
    locales = fr;
  }
  polyglot.extend(locales);
  window.t = polyglot.t.bind(polyglot);
  win.hide();
  return renderState(configHelpers.getState());
};
;
//# sourceMappingURL=app.js.map