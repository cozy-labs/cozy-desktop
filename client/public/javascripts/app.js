var Button, Container, Field, InfoLine, Line, Subtitle, Title;

Line = React.createClass({
  render: function() {
    return div({
      className: 'line mtl clearfix'
    }, this.props.children);
  }
});

Container = React.createClass({
  render: function() {
    return ReactCSSTransitionGroup({
      transitionName: "slide",
      component: div
    }, div({
      className: 'container'
    }, this.props.children));
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
      className: 'btn btn-cozy ' + this.props.className,
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
      className: 'mt1 ' + this.props.fieldClass,
      ref: this.props.inputRef,
      defaultValue: this.props.defaultValue,
      onChange: this.onChange,
      placeholder: this.props.placeholder
    }), this.state.error ? p(null, this.state.error) : void 0);
  },
  getValue: function() {
    return this.refs[this.props.inputRef].getDOMNode().value;
  },
  isValid: function() {
    return this.getValue() !== '';
  },
  onChange: function() {
    var val;
    val = this.refs[this.props.inputRef].getDOMNode().value;
    if (val === '') {
      return this.setState({
        error: 'value is missing'
      });
    } else {
      return this.setState({
        error: null
      });
    }
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
    return Line(null, span({
      className: 'mrm'
    }, this.props.label), value);
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
;var ConfigFormStepOne, ConfigFormStepTwo, Intro, ReactCSSTransitionGroup, StateView, isValidForm;

ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

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
    $('.intro').addClass('slide-leave-up');
    return renderState('STEP1');
  }
});

ConfigFormStepOne = React.createClass({
  render: function() {
    return Container(null, Title({
      text: t('cozy files configuration 1 on 2')
    }), Field({
      label: t('your device name'),
      fieldClass: 'w300p',
      inputRef: 'deviceName',
      defaultValue: this.props.deviceName,
      ref: 'deviceNameField',
      placeholder: 'Laptop'
    }), Field({
      label: t('directory to synchronize your data'),
      fieldClass: 'w500p',
      inputRef: 'path',
      defaultValue: this.props.path,
      ref: 'devicePathField',
      placeholder: '/home/john/mycozyfolder'
    }), Line(null, Button({
      className: 'right',
      onClick: this.onSaveButtonClicked,
      text: t('save your device information and go to step 2')
    })));
  },
  onSaveButtonClicked: function() {
    var config, fieldName, fieldPath, isValid;
    fieldName = this.refs.deviceNameField;
    fieldPath = this.refs.devicePathField;
    isValid = isValidForm([fieldName, fieldPath]);
    if (isValid) {
      config = require('./backend/config');
      config.updateSync({
        deviceName: fieldName.getValue(),
        path: fieldPath.getValue()
      });
      return renderState('STEP2');
    } else {
      return alert('a value is missing');
    }
  }
});

ConfigFormStepTwo = React.createClass({
  render: function() {
    return Container(null, Title({
      text: t('cozy files configuration 2 on 2')
    }), Field({
      label: t('your remote url'),
      fieldClass: 'w300p',
      inputRef: 'remoteUrl',
      defaultValue: this.props.url,
      ref: 'remoteUrlField',
      placeholder: 'john.cozycloud.cc'
    }), Field({
      label: t('your remote password'),
      fieldClass: 'w300p',
      type: 'password',
      inputRef: 'remotePassword',
      defaultValue: this.props.remotePassword,
      ref: 'remotePasswordField'
    }), Line(null, Button({
      className: 'left',
      ref: 'backButton',
      onClick: this.onBackButtonClicked,
      text: t('go back to previous step')
    }), Button({
      className: 'right',
      ref: 'nextButton',
      onClick: this.onSaveButtonClicked,
      text: t('register device and synchronize')
    })));
  },
  onBackButtonClicked: function() {
    return renderState('STEP1');
  },
  onSaveButtonClicked: function() {
    var config, fieldPassword, fieldUrl, isValid, options, password, promise, replication, saveConfig, url;
    fieldUrl = this.refs.remoteUrlField;
    fieldPassword = this.refs.remotePasswordField;
    isValid = isValidForm([fieldUrl, fieldPassword]);
    if (isValid) {
      config = require('./backend/config');
      replication = require('./backend/replication');
      promise = require('./backend/promise');
      url = "https://" + (fieldUrl.getValue());
      password = fieldPassword.getValue();
      options = {
        url: url,
        deviceName: device.deviceName,
        password: password
      };
      saveConfig = function(err, credentials) {
        if (err) {
          console.log(err);
          return console.log('An error occured while registering your device.');
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
    } else {
      return alert('a value is missing');
    }
  }
});

StateView = React.createClass({
  render: function() {
    var change, changes, _i, _len, _ref;
    if (this.state == null) {
      this.state = {
        changes: []
      };
    }
    changes = [];
    _ref = this.state.changes;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      change = _ref[_i];
      changes.push(Line(null, change));
    }
    return Container(null, Title({
      text: 'Cozy Data Proxy'
    }), Subtitle({
      text: 'Parameters'
    }), InfoLine({
      label: t('your device name'),
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
    }), Subtitle({
      text: 'Actions'
    }), Line(null, Button({
      className: 'left',
      ref: 'backButton',
      onClick: this.onResyncClicked,
      text: t('resync all')
    })), Line(null, Button({
      className: 'left',
      ref: 'backButton',
      onClick: this.onDeleteClicked,
      text: t('delete configuration'),
      text: t('delete configuration and files')
    })), changes);
  },
  onResyncClicked: function() {
    var onChange, replication, replicator;
    alert('resync all');
    replication = require('./backend/replication');
    this.state.changes = [];
    onChange = (function(_this) {
      return function(change) {
        return _this.state.changes.push("" + change.docs_written + " elements replicated");
      };
    })(this);
    replicator = replication.runReplication({
      fromRemote: true,
      toRemote: false,
      continuous: false,
      rebuildFs: true,
      fetchBinary: true
    });
    return replicator.on('change', onChange);
  }
});
;var en;

en = {
  'cozy files configuration 1 on 1': 'Configure your device (1/2)',
  'cozy files configuration 2 on 2': 'Register your device (2/2)',
  'directory to synchronize your data': 'Path of the folder where you will see your cozy files:',
  'your device name': 'The name used to sign up your device to your Cozy:',
  'your remote url': 'The web URL of your Cozy',
  'your remote password': 'The password you use to connect to your Cozy:',
  'go back to previous step': '< Previous step',
  'save your device information and go to step 2': 'Save then go to next step >',
  'register device and synchronize': 'Register then go to next step >',
  'start configuring your device': 'Start to configure your device and sync your files',
  'welcome to the cozy data proxy': 'Welcome to the Cozy Data Proxy, the module that syncs your computer with your Cozy!'
};
;var router;

router = React.createClass({
  render: function() {
    return div({
      className: "router"
    }, "Hello, I am a router.");
  }
});
;var a, button, div, h1, h2, img, input, label, p, renderState, span, _ref;

_ref = React.DOM, div = _ref.div, p = _ref.p, img = _ref.img, span = _ref.span, a = _ref.a, label = _ref.label, input = _ref.input, h1 = _ref.h1, h2 = _ref.h2, button = _ref.button;

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
  return React.renderComponent(currentComponent, document.body);
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