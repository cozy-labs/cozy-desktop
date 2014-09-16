var config, configDir, configHelpers, configPath, device, fs, homedir, keys, path;

path = require('path-extra');

fs = require('fs');

homedir = path.homedir();

configDir = path.join(homedir, '.cozy-data-proxy');

configPath = path.join(configDir, 'config.json');

config = require(configPath);

device = {};

keys = Object.keys(config.devices);

if (keys.length > 0) {
  device = config.devices[keys[0]];
}

configHelpers = {
  saveConfigSync: function(deviceConfig) {
    console.log(deviceConfig);
    config.devices[deviceConfig.deviceName] = deviceConfig;
    console.log(configPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return console.log('Configuration file successfully updated');
  }
};
;var ConfigForm;

ConfigForm = React.createClass({
  render: function() {
    return div({
      className: 'container'
    }, h1({}, 'Cozy Files Configuration'), div({
      className: 'line device-name'
    }, label({
      className: 'mod left w25 mr2 ml2'
    }, t('your device name')), input({
      className: 'mod left w75 mt1',
      ref: 'deviceName',
      defaultValue: this.props.deviceName
    })), div({
      className: 'line mt2'
    }, button({
      className: 'mod right btn btn-cozy',
      ref: 'saveButton',
      onClick: this.onSaveButtonClicked
    }, 'Save changes')));
  },
  onSaveButtonClicked: function() {
    this.props.deviceName = this.refs.deviceName.getDOMNode().value;
    configHelpers.saveConfigSync(this.props);
    return alert('Config saved');
  }
});
;var router;

router = React.createClass({
  render: function() {
    return div({
      className: "router"
    }, "Hello, I am a router.");
  }
});
;var button, div, h1, input, label, _ref;

_ref = React.DOM, div = _ref.div, label = _ref.label, input = _ref.input, h1 = _ref.h1, button = _ref.button;

window.onload = function() {
  var configComponent, locale, locales, polyglot;
  window.__DEV__ = window.location.hostname === 'localhost';
  locale = window.locale || window.navigator.language || "en";
  locales = {};
  polyglot = new Polyglot();
  polyglot.extend(locales);
  window.t = polyglot.t.bind(polyglot);
  configComponent = ConfigForm(device);
  return React.renderComponent(configComponent, document.body);
};
;
//# sourceMappingURL=app.js.map