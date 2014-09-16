var config, configDir, configPath, device, homedir, keys, path;

path = require('path-extra');

homedir = path.homedir();

configDir = path.join(homedir, '.cozy-data-proxy');

configPath = path.join(configDir, 'config.json');

config = require(configPath);

device = {};

keys = Object.keys(config.devices);

if (keys.length > 0) {
  device = config.devices[keys[0]];
}
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
      className: 'mod left w75 mt2',
      ref: 'device-name',
      defaultValue: this.props.deviceName,
      onChange: this.onChange
    })));
  },
  onChange: function() {
    this.setState({
      deviceName: this.refs['device-name'].getDOMNode().value
    });
    return console.log(this.props);
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
;var div, h1, input, label, _ref;

_ref = React.DOM, div = _ref.div, label = _ref.label, input = _ref.input, h1 = _ref.h1;

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