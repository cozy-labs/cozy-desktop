var Button, Container, Field, InfoLine, Line, Subtitle, Title, a, button, div, h1, h2, img, input, label, p, span, _ref;

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
    return h1({}, this.props.text);
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
  isValid: function() {
    return this.getValue() !== '';
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

InfoLine = React.createClass({
  render: function() {
    var value;
    if (this.props.link != null) {
      value = span(null, a({
        href: "" + this.props.link.type + "://" + this.props.value
      }, this.props.value));
    } else {
      value = span(null, this.props.value);
    }
    return Line({
      className: 'line mts'
    }, span({
      className: 'mod w100p left'
    }, "" + this.props.label + ":"), span({
      className: 'mod left'
    }, value));
  }
});
;var config, configDir, configHelpers, configPath, device, fs, homedir, keys, path;

path = require('path-extra');

fs = require('fs');

homedir = path.homedir();

configDir = path.join(homedir, '.cozy-data-proxy');

configPath = path.join(configDir, 'config.json');

if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    devices: {}
  }, null, 2));
}

config = require(configPath);

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
    } else if (device.deviceId == null) {
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
      text: 'Cozy Data Proxy'
    }), Container({
      className: 'mod w50 left'
    }, Subtitle({
      text: 'Parameters'
    }), InfoLine({
      label: t('device name'),
      value: device.deviceName
    }), InfoLine({
      label: t('path'),
      link: {
        type: 'file'
      },
      value: device.path
    }), InfoLine({
      label: t('url'),
      value: device.url
    }), InfoLine({
      label: t('sync state'),
      value: state
    })), Container({
      className: 'mod w50 left'
    }, Subtitle({
      text: 'Actions'
    }), Line({
      className: 'mts'
    }, Button({
      className: 'left action',
      onClick: this.onSyncClicked,
      text: syncButtonLabel
    })), Line({
      className: 'mtm'
    }, Button({
      className: 'smaller',
      onClick: this.onDeleteConfigurationClicked,
      text: t('delete configuration')
    }))), Line(null), Line(null, Subtitle({
      text: 'Logs'
    }), logs, Line(null, Button({
      className: 'left smaller',
      onClick: this.clearLogs,
      text: t('clear logs')
    }))));
  },
  onSyncClicked: function() {
    return this.sync({
      force: false
    });
  },
  sync: function(options) {
    var filesystem, publisher, replication;
    replication = require('./backend/replication');
    filesystem = require('./backend/filesystem');
    publisher = require('./backend/publisher');
    if (this.state.sync) {
      this.setState({
        sync: false
      });
      if (replication.replicator != null) {
        replication.replicator.cancel();
      }
      return this.displayLog('Synchronization is off');
    } else {
      this.displayLog('Synchronization is on...');
      this.displayLog('First synchronization can take a while to init...');
      this.setState({
        sync: true
      });
      replication.runReplication({
        fromRemote: true,
        toRemote: true,
        force: options.force
      });
      publisher.on('binaryPresent', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " is already there.");
        };
      })(this));
      publisher.on('binaryDownloadStart', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " is downloading...");
        };
      })(this));
      publisher.on('binaryDownloaded', (function(_this) {
        return function(path) {
          return _this.displayLog("File " + path + " downloaded");
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
          return _this.displayLog("File moved: " + previousPath + " -> " + newPath);
        };
      })(this));
      publisher.on('directoryEnsured', (function(_this) {
        return function(path) {
          return _this.displayLog("Folder " + path + " ensured");
        };
      })(this));
      publisher.on('folderDeleted', (function(_this) {
        return function(path) {
          return _this.displayLog("Folder " + path + " deleted");
        };
      })(this));
      return publisher.on('folderMoved', (function(_this) {
        return function(info) {
          var newPath, previousPath;
          previousPath = info.previousPath, newPath = info.newPath;
          return _this.displayLog("Folder moved: " + previousPath + " -> " + newPath);
        };
      })(this));
    }
  },
  clearLogs: function() {
    return this.setState({
      logs: []
    });
  },
  displayLog: function(log) {
    var logs, moment;
    logs = this.state.logs;
    moment = require('moment');
    logs.push(moment().format('HH:MM:SS ') + log);
    return this.setState({
      logs: logs
    });
  },
  onDeleteConfigurationClicked: function() {
    var config;
    config = require('./backend/config');
    config.removeRemoteCozy(device.deviceName);
    config.saveConfig();
    alert(t('Configuration deleted.'));
    return renderState('INTRO');
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
  }
});
;var en;

en = {
  'cozy files configuration 1 on 2': 'Configure your device (1/2)',
  'cozy files configuration 2 on 2': 'Register your device (2/2)',
  'directory to synchronize your data': 'Path of the folder where you will see your cozy files:',
  'your device name': 'The name used to sign up your device to your Cozy:',
  'your remote url': 'The web URL of your Cozy',
  'your remote password': 'The password you use to connect to your Cozy:',
  'go back to previous step': '< Previous step',
  'save your device information and go to step 2': 'Save then go to next step >',
  'register device and synchronize': 'Register then go to next step >',
  'start configuring your device': 'Start to configure your device and sync your files',
  'welcome to the cozy data proxy': 'Welcome to the Cozy Data Proxy, the module that syncs your computer with your Cozy!',
  'path': 'Path',
  'url': 'URL',
  'resync all': 'Resync All',
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
  'first step text': "Prior to register your computer to your Cozy, we need information about it.",
  'second step text': "It's time to register your computer to your Cozy.\n(password won't be stored)."
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
;var ConfigFormStepOne, ConfigFormStepTwo, Intro;

Intro = React.createClass({
  render: function() {
    return Container(null, div({
      className: 'intro txtcenter mtl'
    }, img({
      id: 'logo',
      src: 'client/public/icon/bighappycloud.png'
    }), p({
      className: 'mtl biggest'
    }, t('welcome to the cozy data proxy')), Button({
      className: 'mtl bigger pam',
      onClick: this.onEnterClicked,
      text: t('start configuring your device')
    })));
  },
  onEnterClicked: function() {
    return renderState('STEP1');
  }
});

ConfigFormStepOne = React.createClass({
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
    buttonClass = 'right';
    if (!this.state.validForm) {
      buttonClass += ' disabled';
    }
    return Container(null, Title({
      text: t('cozy files configuration 1 on 2')
    }), Line({
      className: 'explanation'
    }, p(null, t('first step text'))), Field({
      label: t('your device name'),
      fieldClass: 'w300p',
      inputRef: 'deviceName',
      defaultValue: this.props.deviceName,
      ref: 'deviceNameField',
      placeholder: 'Laptop',
      onChange: this.onDeviceNameChanged
    }), Field({
      label: t('directory to synchronize your data'),
      fieldClass: 'w500p',
      inputRef: 'path',
      type: 'file',
      defaultValue: this.props.path,
      ref: 'devicePathField',
      inputId: 'folder-input',
      onChange: this.onPathChanged
    }), Line(null, Button({
      className: buttonClass,
      onClick: this.onSaveButtonClicked,
      text: t('save your device information and go to step 2')
    })));
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
    var config, fieldName, fieldPath;
    fieldName = this.refs.deviceNameField;
    fieldPath = this.refs.devicePathField;
    if (this.state.validForm) {
      config = require('./backend/config');
      config.updateSync({
        deviceName: fieldName.getValue(),
        path: fieldPath.getValue()
      });
      device.deviceName = fieldName.getValue();
      device.path = fieldPath.getValue();
      return renderState('STEP2');
    }
  }
});

ConfigFormStepTwo = React.createClass({
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
    buttonClass = 'right';
    if (!this.state.validForm) {
      buttonClass += ' disabled';
    }
    return Container(null, Title({
      text: t('cozy files configuration 2 on 2')
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
      onKeyUp: this.onPasswordKeyUp
    }), Line(null, Button({
      className: 'left',
      ref: 'backButton',
      onClick: this.onBackButtonClicked,
      text: t('go back to previous step')
    }), Button({
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
  onPasswordKeyUp: function(event) {
    if (event.keyCode === 13) {
      return this.onSaveButtonClicked();
    }
  },
  onBackButtonClicked: function() {
    return renderState('STEP1');
  },
  onSaveButtonClicked: function() {
    var config, fieldPassword, fieldUrl, options, password, replication, saveConfig, url;
    fieldUrl = this.refs.remoteUrlField;
    fieldPassword = this.refs.remotePasswordField;
    if (isValidForm([fieldUrl, fieldPassword])) {
      config = require('./backend/config');
      replication = require('./backend/replication');
      url = "https://" + (fieldUrl.getValue());
      password = fieldPassword.getValue();
      console.log(device);
      options = {
        url: url,
        deviceName: device.deviceName,
        password: password
      };
      saveConfig = function(err, credentials) {
        if (err) {
          console.log(err);
          return alert("An error occured while registering your device. " + err);
        } else {
          options = {
            url: url,
            deviceId: credentials.id,
            devicePassword: credentials.password
          };
          config.updateSync(options);
          console.log('Remote Cozy properly configured to work ' + 'with current device.');
          return renderState('STATE');
        }
      };
      return replication.registerDevice(options, saveConfig);
    }
  }
});
;var renderState;

renderState = function(state) {
  var currentComponent;
  switch (state) {
    case 'INTRO':
      currentComponent = Intro();
      break;
    case 'STEP1':
      currentComponent = ConfigFormStepOne(device);
      break;
    case 'STEP2':
      currentComponent = ConfigFormStepTwo(device);
      break;
    case 'STEP3':
      currentComponent = ConfigFormStepThree(device);
      break;
    case 'STATE':
      currentComponent = StateView(device);
      break;
    default:
      currentComponent = Intro();
  }
  React.renderComponent(currentComponent, document.body);
  if (state === 'STEP1') {
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
  polyglot.extend(locales);
  window.t = polyglot.t.bind(polyglot);
  return renderState(configHelpers.getState());
};
;
//# sourceMappingURL=app.js.map