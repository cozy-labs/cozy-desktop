var router;

router = React.createClass({
  render: function() {
    return div({
      className: "router"
    }, "Hello, I am a router.");
  }
});
;var div;

div = React.DOM.div;

window.onload = function() {
  var hello, locale, locales, polyglot;
  window.__DEV__ = window.location.hostname === 'localhost';
  locale = window.locale || window.navigator.language || "en";
  locales = {};
  polyglot = new Polyglot();
  polyglot.extend(locales);
  window.t = polyglot.t.bind(polyglot);
  hello = React.createClass({
    render: function() {
      return div({
        className: "commentbox"
      }, "hello, world! i am a commentbox.");
    }
  });
  React.renderComponent(new hello, document.body);
  return React.renderComponent(new router, document.body);
};
;
//# sourceMappingURL=app.js.map