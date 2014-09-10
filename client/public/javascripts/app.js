(function(/*! Brunch !*/) {
  'use strict';

  var globals = typeof window !== 'undefined' ? window : global;
  if (typeof globals.require === 'function') return;

  var modules = {};
  var cache = {};

  var has = function(object, name) {
    return ({}).hasOwnProperty.call(object, name);
  };

  var expand = function(root, name) {
    var results = [], parts, part;
    if (/^\.\.?(\/|$)/.test(name)) {
      parts = [root, name].join('/').split('/');
    } else {
      parts = name.split('/');
    }
    for (var i = 0, length = parts.length; i < length; i++) {
      part = parts[i];
      if (part === '..') {
        results.pop();
      } else if (part !== '.' && part !== '') {
        results.push(part);
      }
    }
    return results.join('/');
  };

  var dirname = function(path) {
    return path.split('/').slice(0, -1).join('/');
  };

  var localRequire = function(path) {
    return function(name) {
      var dir = dirname(path);
      var absolute = expand(dir, name);
      return globals.require(absolute, path);
    };
  };

  var initModule = function(name, definition) {
    var module = {id: name, exports: {}};
    cache[name] = module;
    definition(module.exports, localRequire(name), module);
    return module.exports;
  };

  var require = function(name, loaderPath) {
    var path = expand(name, '.');
    if (loaderPath == null) loaderPath = '/';

    if (has(cache, path)) return cache[path].exports;
    if (has(modules, path)) return initModule(path, modules[path]);

    var dirIndex = expand(path, './index');
    if (has(cache, dirIndex)) return cache[dirIndex].exports;
    if (has(modules, dirIndex)) return initModule(dirIndex, modules[dirIndex]);

    throw new Error('Cannot find module "' + name + '" from '+ '"' + loaderPath + '"');
  };

  var define = function(bundle, fn) {
    if (typeof bundle === 'object') {
      for (var key in bundle) {
        if (has(bundle, key)) {
          modules[key] = bundle[key];
        }
      }
    } else {
      modules[bundle] = fn;
    }
  };

  var list = function() {
    var result = [];
    for (var item in modules) {
      if (has(modules, item)) {
        result.push(item);
      }
    }
    return result;
  };

  globals.require = require;
  globals.require.define = define;
  globals.require.register = define;
  globals.require.list = list;
  globals.require.brunch = true;
})();
require.register("application", function(exports, require, module) {
module.exports = {
  initialize: function() {
    var Router;
    this.isPublic = window.location.pathname.indexOf('/public/') === 0;
    Router = require('router');
    this.router = new Router();
    window.app = this;
    Backbone.history.start();
    if (typeof Object.freeze === 'function') {
      return Object.freeze(this);
    }
  }
};
});

;require.register("collections/files", function(exports, require, module) {
var File, FileCollection,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

File = require('../models/file');


/*
Represents a collection of files
It acts as the cache when instantiate as the baseCollection
The base collection holds ALL the files and folders of the application
It creates projections (subcollection) that will be consumed by folder views.
Those projections represents one folder.
 */

module.exports = FileCollection = (function(_super) {
  __extends(FileCollection, _super);

  function FileCollection() {
    return FileCollection.__super__.constructor.apply(this, arguments);
  }

  FileCollection.prototype.model = File;

  FileCollection.prototype.url = 'files';

  FileCollection.prototype.cachedPaths = [];

  FileCollection.prototype.isPathCached = function(path) {
    return this.cachedPaths.indexOf(path) !== -1;
  };


  /*
      Retrieves folder's information (meta data)
      * from memory if it's cached
      * otherwise, from server
   */

  FileCollection.prototype.getFolderInfo = function(folderID, callback) {
    var folder;
    folder = this.get(folderID);
    if (folder == null) {
      folder = new File({
        id: folderID,
        type: "folder"
      });
      return folder.fetch({
        success: (function(_this) {
          return function() {
            _this.add(folder);
            return callback(null, folder);
          };
        })(this),
        error: function(xhr, resp) {
          return callback({
            status: resp.status,
            msg: resp.statusText
          });
        }
      });
    } else {
      return callback(null, folder);
    }
  };

  FileCollection.prototype.getFolderContent = function(folder, callback) {
    var path;
    if (callback == null) {
      callback = function() {};
    }
    path = folder.getRepository();
    return folder.fetchContent((function(_this) {
      return function(err, content, parents) {
        var contentIDs, itemsToRemove;
        if (err != null) {
          return callback(err);
        } else {
          _this.set(content, {
            remove: false
          });
          contentIDs = _.pluck(content, 'id');
          path = folder.getRepository();
          itemsToRemove = _this.getSubCollection(path).filter(function(item) {
            var _ref;
            return _ref = item.get('id'), __indexOf.call(contentIDs, _ref) < 0;
          });
          _this.remove(itemsToRemove);
          if (!_this.isPathCached(path)) {
            _this.cachedPaths.push(path);
          }
          return callback();
        }
      };
    })(this));
  };


  /*
      Global method to retrieve folder's info and content
      and create a subcollection (projection) based on the current collection
   */

  FileCollection.prototype.getByFolder = function(folderID, callback) {
    return this.getFolderInfo(folderID, (function(_this) {
      return function(err, folder) {
        var collection, filter, path;
        if (err != null) {
          return callback(err);
        } else {
          path = folder.getRepository();
          filter = function(file) {
            return file.get('path') === path && !file.isRoot();
          };
          collection = new BackboneProjections.Filtered(_this, {
            filter: filter,
            comparator: _this.comparator
          });
          if (_this.isPathCached(path)) {
            return callback(null, folder, collection);
          } else {
            return _this.getFolderContent(folder, function() {
              return callback(null, folder, collection);
            });
          }
        }
      };
    })(this));
  };

  FileCollection.prototype.existingPaths = function() {
    return this.map(function(model) {
      return model.getRepository();
    });
  };

  FileCollection.prototype.getSubCollection = function(path) {
    var filter;
    filter = function(file) {
      return file.get('path') === path && !file.isRoot();
    };
    return new BackboneProjections.Filtered(this, {
      filter: filter,
      comparator: this.comparator
    });
  };

  FileCollection.prototype.comparator = function(f1, f2) {
    var e1, e2, n1, n2, sort, t1, t2;
    if (this.type == null) {
      this.type = 'name';
    }
    if (this.order == null) {
      this.order = 'asc';
    }
    t1 = f1.get('type');
    t2 = f2.get('type');
    if (f1.isFolder() && !f2.isFolder() && f1.isNew()) {
      return -1;
    }
    if (f2.isFolder() && !f1.isFolder() && f2.isNew()) {
      return 1;
    }
    if (this.type === 'name') {
      n1 = f1.get('name').toLocaleLowerCase();
      n2 = f2.get('name').toLocaleLowerCase();
    } else if (this.type === "lastModification") {
      n1 = new Date(f1.get('lastModification')).getTime();
      n2 = new Date(f2.get('lastModification')).getTime();
    } else {
      n1 = f1.get(this.type);
      n2 = f2.get(this.type);
    }
    sort = this.order === 'asc' ? -1 : 1;
    if (t1 === t2) {
      if (this.type === 'class' && n1 === n2) {
        n1 = f1.get('name').toLocaleLowerCase();
        n2 = f2.get('name').toLocaleLowerCase();
        e1 = n1.split('.').pop();
        e2 = n2.split('.').pop();
        if (e1 !== e2) {
          if (e1 > e2) {
            return -sort;
          }
          if (e1 < e2) {
            return sort;
          }
          return 0;
        }
      }
      if (n1 > n2) {
        return -sort;
      } else if (n1 < n2) {
        return sort;
      } else {
        return 0;
      }
    } else if (t1 === 'file' && t2 === 'folder') {
      return 1;
    } else {
      return -1;
    }
  };

  return FileCollection;

})(Backbone.Collection);
});

;require.register("collections/upload_queue", function(exports, require, module) {
var File, Helpers, UploadQueue,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

File = require('../models/file');

Helpers = require('../lib/folder_helpers');

module.exports = UploadQueue = (function(_super) {
  __extends(UploadQueue, _super);

  function UploadQueue() {
    this.uploadWorker = __bind(this.uploadWorker, this);
    this.sumProp = __bind(this.sumProp, this);
    this.computeProgress = __bind(this.computeProgress, this);
    return UploadQueue.__super__.constructor.apply(this, arguments);
  }

  UploadQueue.prototype.loaded = 0;

  UploadQueue.prototype.uploadingPaths = {};

  UploadQueue.prototype.initialize = function() {
    this.asyncQueue = async.queue(this.uploadWorker, 5);
    this.listenTo(this, 'add', (function(_this) {
      return function(model) {
        _this.completed = false;
        if (model.get('type') === 'file') {
          return _this.asyncQueue.push(model);
        } else if (model.get('type') === 'folder') {
          return _this.asyncQueue.unshift(model);
        } else {
          throw new Error('adding wrong typed model to upload queue');
        }
      };
    })(this));
    this.listenTo(this, 'remove', (function(_this) {
      return function(model) {
        return model.error = 'aborted';
      };
    })(this));
    this.listenTo(this, 'sync error', (function(_this) {
      return function(model) {
        var path;
        path = model.get('path') + '/';
        _this.uploadingPaths[path]--;
        return _this.loaded++;
      };
    })(this));
    this.listenTo(this, 'progress', _.throttle((function(_this) {
      return function() {
        return _this.trigger('upload-progress', _this.computeProgress());
      };
    })(this), 100));
    return this.asyncQueue.drain = (function(_this) {
      return function() {
        _this.completed = true;
        return _this.trigger('upload-complete');
      };
    })(this);
  };

  UploadQueue.prototype.add = function() {
    if (this.completed) {
      this.reset();
    }
    return UploadQueue.__super__.add.apply(this, arguments);
  };

  UploadQueue.prototype.reset = function(models, options) {
    this.loaded = 0;
    this.completed = false;
    this.uploadingPaths = {};
    return UploadQueue.__super__.reset.apply(this, arguments);
  };

  UploadQueue.prototype.computeProgress = function() {
    return this.progress = {
      loadedFiles: this.loaded,
      totalFiles: this.length,
      loadedBytes: this.sumProp('loaded'),
      totalBytes: this.sumProp('total')
    };
  };

  UploadQueue.prototype.sumProp = function(prop) {
    var iter;
    iter = function(sum, model) {
      return sum + model[prop];
    };
    return this.reduce(iter, 0);
  };

  UploadQueue.prototype.uploadWorker = function(model, cb) {
    if (model.existing || model.error || model.isUploaded) {
      setTimeout(cb, 10);
    }
    return model.save(null, {
      success: function() {
        model.file = null;
        model.isUploaded = true;
        model.loaded = model.total;
        if (!app.baseCollection.get(model.id)) {
          app.baseCollection.add(model);
        }
        return cb(null);
      },
      error: (function(_this) {
        return function(_, err) {
          var body, e;
          body = (function() {
            try {
              return JSON.parse(err.responseText);
            } catch (_error) {
              e = _error;
              return {
                msg: null
              };
            }
          })();
          if (err.status === 400 && body.code === 'EEXISTS') {
            model.existing = true;
            return cb(new Error(body.msg));
          }
          if (err.status === 400 && body.code === 'ESTORAGE') {
            model.error = new Error(body.msg);
            return cb(model.error);
          }
          model.tries = 1 + (model.tries || 0);
          if (model.tries > 3) {
            model.error = t(err.msg || "modal error file upload");
          } else {
            _this.asyncQueue.push(model);
          }
          return cb(err);
        };
      })(this)
    });
  };

  UploadQueue.prototype.addBlobs = function(blobs, folder) {
    var existingPaths, i, nonBlockingLoop;
    i = 0;
    existingPaths = app.baseCollection.existingPaths();
    return (nonBlockingLoop = (function(_this) {
      return function() {
        var blob, model, path, relPath, _ref;
        if (!(blob = blobs[i++])) {
          return;
        }
        path = folder.getRepository() || '';
        relPath = blob.relativePath || blob.mozRelativePath || blob.webkitRelativePath || blob.msRelativePath;
        if (relPath) {
          path += '/' + Helpers.dirName(relPath);
        }
        model = new File({
          type: 'file',
          "class": 'document',
          size: blob.size,
          name: blob.name,
          path: path,
          lastModification: blob.lastModifiedDate
        });
        if (_ref = model.getRepository(), __indexOf.call(existingPaths, _ref) >= 0) {
          model.existing = true;
        } else {
          model.file = blob;
          model.loaded = 0;
          model.total = blob.size;
        }
        _this.add(model);
        _this.markAsBeingUploaded(model);
        return setTimeout(nonBlockingLoop, 2);
      };
    })(this))();
  };

  UploadQueue.prototype.addFolderBlobs = function(blobs, parent) {
    var dirs, i, nonBlockingLoop;
    dirs = Helpers.nestedDirs(blobs);
    i = 0;
    return (nonBlockingLoop = (function(_this) {
      return function() {
        var dir, folder, name, parts, path, prefix;
        if (!(dir = dirs[i++])) {
          blobs = _.filter(blobs, function(blob) {
            var _ref;
            return (_ref = blob.name) !== '.' && _ref !== '..';
          });
          _this.addBlobs(blobs, parent);
          return;
        }
        prefix = parent.getRepository();
        parts = dir.split('/').filter(function(x) {
          return x;
        });
        name = parts[parts.length - 1];
        path = [prefix].concat(parts.slice(0, -1)).join('/');
        folder = new File({
          type: "folder",
          name: name,
          path: path
        });
        folder.loaded = 0;
        folder.total = 250;
        _this.add(folder);
        _this.markAsBeingUploaded(folder);
        return setTimeout(nonBlockingLoop, 2);
      };
    })(this))();
  };

  UploadQueue.prototype.filteredByFolder = function(folder, comparator) {
    var filteredUploads;
    return filteredUploads = new BackboneProjections.Filtered(this, {
      filter: function(file) {
        return file.get('path') === folder.getRepository() && !file.isUploaded;
      },
      comparator: comparator
    });
  };

  UploadQueue.prototype.getResults = function() {
    var error, existing, status, success;
    error = [];
    existing = [];
    success = 0;
    this.each(function(model) {
      if (model.error) {
        console.log("Upload Error", model.getRepository(), model.error);
        return error.push(model);
      } else if (model.existing) {
        return existing.push(model);
      } else {
        return success++;
      }
    });
    status = error.length ? 'error' : existing.length ? 'warning' : 'success';
    return {
      status: status,
      error: error,
      existing: existing,
      success: success
    };
  };

  UploadQueue.prototype.markAsBeingUploaded = function(model) {
    var path;
    path = model.get('path') + '/';
    if (this.uploadingPaths[path] == null) {
      this.uploadingPaths[path] = 0;
    }
    return this.uploadingPaths[path]++;
  };

  UploadQueue.prototype.getNumUploadingElementsByPath = function(path) {
    path = path + '/';
    return _.reduce(this.uploadingPaths, function(memo, value, index) {
      if (index.indexOf(path) !== -1 || path === '') {
        return memo + value;
      } else {
        return memo;
      }
    }, 0);
  };

  return UploadQueue;

})(Backbone.Collection);
});

;require.register("initialize", function(exports, require, module) {
var app;

app = require('application');

$(function() {
  var err, locale, locales, polyglot;
  jQuery.event.props.push('dataTransfer');
  locale = window.locale || "en";
  moment.lang(locale);
  locales = {};
  try {
    locales = require("locales/" + locale);
  } catch (_error) {
    err = _error;
    locales = require("locales/en");
  }
  polyglot = new Polyglot();
  polyglot.extend(locales);
  window.t = polyglot.t.bind(polyglot);
  return app.initialize();
});
});

;require.register("locales/en", function(exports, require, module) {
module.exports = {
  "ok": "OK"
};
});

;require.register("models/test", function(exports, require, module) {

});

;require.register("router", function(exports, require, module) {
var Router, app,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

app = require('application');


/*
Binds routes to code actions.
This is also used as a controller to initialize views and perform data fetching
 */

module.exports = Router = (function(_super) {
  __extends(Router, _super);

  function Router() {
    return Router.__super__.constructor.apply(this, arguments);
  }

  Router.prototype.routes = {
    '': 'main',
    'config/:devicename': 'config',
    'search/:query': 'search'
  };

  Router.prototype.main = function() {};

  Router.prototype.config = function(devicename) {};

  return Router;

})(Backbone.Router);
});

;require.register("views/templates/test", function(exports, require, module) {
var __templateData = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

;return buf.join("");
};
if (typeof define === 'function' && define.amd) {
  define([], function() {
    return __templateData;
  });
} else if (typeof module === 'object' && module && module.exports) {
  module.exports = __templateData;
} else {
  __templateData;
}
});

;require.register("views/test", function(exports, require, module) {

});

;require.register("widgets/test", function(exports, require, module) {

});

;
//# sourceMappingURL=app.js.map