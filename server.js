"use strict";


/* ************************************************** *
 * ******************** NPM Modules
 * ************************************************** */

const async = require('async'),
  EventEmitter = require('events'),
  fs = require('fs'),
  os = require('os'),
  path = require('path'),
  Remie = require('remie'),
  Riposte = require('riposte'),
  util = require('util');

// Path to the node.js application files. (e.g. api endpoints)
const applicationPath = path.resolve("./app"),
  npmConfig = require(path.resolve("./package.json"));


/* ************************************************** *
 * ******************** Local Modules
 * ************************************************** */

const Cql = require(path.resolve('./libs/cql')),
  Log = require(path.resolve('./libs/log'));


/* ************************************************** *
 * ******************** Private Non-Class Methods
 * ************************************************** */

/**
 * Create an asynchronous function that will call a
 * classes method with the result returned to a callback.
 * @param self is the class instance.
 * @param methodName is the name of the classes method.
 * @returns {Function} a new function that accepts a
 * callback as it's only parameter.  The function will
 * call the specified classes method with the callback
 * as the only parameter.
 */
let createClassAsyncMethod = function (self, methodName) {
  return function (cb) {
    self[methodName](cb);
  }
};

let getHostIpAddress = function (cb) {
  let os = require('os'),
    networkInterfaces = os.networkInterfaces(),
    ipAddresses = [];

  // Loop through the list of network interfaces.
  Object.keys(networkInterfaces).forEach(function (key) {
    // Loop through each address for the network interface.
    networkInterfaces[key].forEach(function(networkInterface) {
      // Looking for external IPv4 addresses.
      if('IPv4' === networkInterface.family && networkInterface.internal === false) {
        ipAddresses.push(networkInterface.address);
      }
    });
  });

  cb(undefined, ipAddresses[0]);
};


/* ************************************************** *
 * ******************** Node Server Class
 * ************************************************** */

class Server {
  constructor(options) {
    this.initConfig(options);

    // Add event emitter properties to the class instance.
    EventEmitter.call(this);

    // Create a new logger instance.
    this.log = (new Log()).createLogger(this.config.log);

    this.npmConfig = npmConfig;

    return this;
  }

  /* ************************************************** *
   * ******************** Public Methods
   * ************************************************** */

  /**
   * Start the Node.js server.  Events, such as ready and
   * error, will be emitted using the standard event emitter.
   */
  start(options) {
    let self = this,
      tasks = [];

    tasks.push(createClassAsyncMethod(self, "initI18next"));
    tasks.push(createClassAsyncMethod(self, "initDynamoDB"));
    tasks.push(createClassAsyncMethod(self, "initCassandra"));
    tasks.push(createClassAsyncMethod(self, "initExpress"));
    tasks.push(createClassAsyncMethod(self, "configureRiposte"));
    //tasks.push(createClassAsyncMethod(self, "initApplication"));
    tasks.push(createClassAsyncMethod(self, "loadSenecaApp"));
    //tasks.push(createClassAsyncMethod(self, "loadStaticData"));
    tasks.push(createClassAsyncMethod(self, "setResponseHandlers"));
    tasks.push(createClassAsyncMethod(self, "startExpressServer"));

    async.series(tasks, function(err) {
      if(err) {
        self.log.error(err);
      } else {
        self.log.info("Seneca listening with %s config.", self.config.environment);
        self.emit('ready', self.seneca);
      }
    });

    return self;
  }

  stop(options) {
    // TODO: stop the server gracefully.
  }

  log() {
    return this.log;
  }

  application() {
    return this.app;
  }


  /* ************************************************** *
   * ******************** Private Methods
   * ************************************************** */

  configureRiposte(cb) {
    let self = this;
    self.riposte.use(Riposte.HANDLE_SANITIZE_REPLY_DATA, function (data, options = {}, next, riposte) {
      next(undefined, data);
    });
    cb();
  }

  // Load the application models and endpoints.
  initApplication (cb) {
    let self = this;
    self.log.trace('Load application models and endpoints.');

    self.cql.loadModels(function(err, models) {
      if(err) {
        cb(err);
      } else {
        self.models = models;

        //Initialize seneca.
        if(config.has('seneca')) {
          self.seneca = require('seneca');
        }

        let crave = require('crave');
        crave.setConfig(self.config.crave);
        // Recursively load all files of the specified type(s) that are also located in the specified folder.
        crave.directory(path.resolve("./app"), ["api"], cb, self);
      }
    });
  }

  /**
   * Setup and connect to a cassandra database cluster.
   * @param {function} cb is a callback method.
   */
  initCassandra(cb) {
    let self = this;
    if(self.config.cassandra) {
      self.log.trace('Initializing cassandra.');
      self.cql = new Cql(self);
      self.cql.init(function(err, cassandraClient) {
        self.cassandraClient = cassandraClient;
        cb(err);
      });
    } else {
      cb();
    }
  }

  /**
   * Modify the config object with any dynamic values,
   * then make it immutable.  This must be called before
   * config.get().
   * @param {object} options is the options object
   * passed into the classes constructor.
   */
  initConfig(options) {
    let self = this;

    self.config = require('./config.js');

    if(!self.config.log.name) {
      self.config.log.name = self.config.server.name;
    }

    if(self.config.session && !self.config.session.name) {
      self.config.session.name = self.config.server.name + ".sid";
    }

    if(!self.config.server.url) {
      self.config.server.url = self.config.server.protocol + "://" + self.config.server.domainName;
      if(self.config.server.port != 80) self.config.server.url += ":" + self.config.server.port;
    }

    // Make the configuration object immutable.
    //config.get('server');
    //self.config = config;
  }

  initDynamoDB(cb) {
    let self = this;

    if(self.config.dynamoDb) {
      self.log.trace('Initializing Dynamo DB.');
      let AWS = require('aws-sdk');
      self.dynamoDb = new AWS.DynamoDB(self.config.dynamoDb.aws);
    }
    cb();
  }

  initExpress(cb) {
    let self = this;
    self.log.trace('Initializing express.');

    let compress = require('compression'),
      express = require('express'),
      bodyParser = require('body-parser'),
      riposte = new Riposte(),
      session = require('express-session'),
      userAgent = require('express-useragent');

    riposte.set({
      log: self.log,
      remie: self.remie
    });

    // Create an express application object.
    let app = express();

    // If the cookie is secure and proxy is enabled. We need to enable express' trust proxy for it set cookies correctly.
    if (self.config.session && self.config.session.cookie.secure && self.config.session.proxy) {
      app.enable('trust proxy');
    }

    // Disable the "X-Powered-By: Express" HTTP header, which is enabled by default.
    app.disable("x-powered-by");

    // Parses the user agent string and exposes helpful properties.
    app.use(userAgent.express());

    // Enable G-ZIP compression.
    app.use(compress());

    // Parse url encoded json, "Content-Type: application/x-www-form-urlencoded"
    app.use(bodyParser.urlencoded({ extended: false }));

    // Parse bodies with json, "Content-Type: application/json"
    app.use(bodyParser.json());

    // Create a new response handler instance.
    riposte.addExpressPreMiddleware(app);

    // Allow Cross-Origin Resource Sharing.
    if(self.config.server.allowCors) {
      let cors = require('cors');
      app.use(cors());
    }

    self.initSessionStore(function (err, expressSessionStore) {
      if(err) {
        cb(err);
      } else {
        if(expressSessionStore) {
          app.use(expressSessionStore);
        }

        // If included, configure webpack.
        if(self.config.webpack && self.config.webpack.configFilePath) {
          let webpack = require('webpack'),
            webpackHotMiddleware = require('webpack-hot-middleware'),
            webpackMiddleware = require('webpack-dev-middleware');

          let webpackConfig = require(path.resolve(self.config.webpack.configFilePath));

          let compiler = webpack(webpackConfig),
            middleware = webpackMiddleware(compiler, self.config["webpack-dev-middleware"]);

          app.use(middleware);
          app.use(webpackHotMiddleware(compiler));
          app.get('/', function response(req, res) {
            res.write(middleware.fileSystem.readFileSync(path.join(__dirname, 'client/dist/index.html')));
            res.end();
          });

        } else {
          app.use(express.static(path.join(__dirname, '/client/dist'), self.config.express.static));
          app.get('/', function response(req, res) {
            res.sendFile(path.join(__dirname, 'client/dist/index.html'));
          });
        }

        // Log all requests when trace level logging is enabled.
        /*if(config.has('log.logAllRequests') && config.get('log.logAllRequests') === true) {
          app.all('/*', function(req, res, next) {
            switch(req.method) {
              case "POST":
              case "PUT":
                self.log.trace(req.method+' '+req.protocol+'://'+req.get('host')+req.originalUrl+'\n\nHeaders: %s\n\nBody: %s', JSON.stringify(req.headers, undefined, 2), JSON.stringify(req.body, undefined, 2));
                break;
              default:
                self.log.trace(req.method+' '+req.protocol+'://'+req.get('host')+req.originalUrl);
                break;
            }
            next();
          });
        }*/

        // Configure i18n with express.
        if(self.config.i18n) {
          let i18next = require('i18next'),
            i18nextMiddleware = require('i18next-express-middleware');

          app.use(i18nextMiddleware.handle(i18next));
          app.post('/locales/add/:lng/:ns', i18nextMiddleware.missingKeyHandler(i18next)); // serves missing key route for consumers (browser)
          app.get('/locales/resources.json', i18nextMiddleware.getResourcesHandler(i18next)); // serves resources for consumers (browser)
        }

        // Add the image folder as a static path.
        app.use('/img', express.static(path.join(__dirname + '/client/src/img'), self.config.express.static));

        self.riposte = riposte;
        self.app = app;
        cb();
      }
    });
  }

  initI18next(cb) {
    let self = this;

    if(self.config.i18n) {
      self.log.trace('Initializing i18next.');

      let i18next = require('i18next'),
        i18nextMiddleware = require('i18next-express-middleware'),
        i18nextFileSystemBackEnd = require('i18next-node-fs-backend'),
        i18nextSprintf = require('i18next-sprintf-postprocessor');

      i18next
        .use(i18nextMiddleware.LanguageDetector)
        .use(i18nextFileSystemBackEnd)
        .use(i18nextSprintf)
        .init(self.config.i18n, function (err, i18nextTranslate) {
          self.i18nextTranslate = i18nextTranslate;
          cb(err);
        });

      i18next.on('missingKey', function (lngs, namespace, key, res) {
        self.log.warn("i18next(): Missing %s %s %s", lngs, namespace, key);
      });

      self.i18next = i18next;
      self.remie = new Remie({ i18next: i18next });
    } else {
      self.remie = new Remie();
      cb();
    }
  }

  initSessionStore(cb) {
    let self = this;
    if(self.config.session) {
      self.log.trace('Initializing session store.');

      // Set-up express sessions
      let sessionConfig = {
        name: self.config.session.name,
        secret: self.config.session.secret,
        cookie: {
          secure: self.config.session.cookie.secure
        },
        resave: self.config.session.resave,
        saveUninitialized: self.config.session.saveUninitialized
      };

      // Create and add a session store.
      let sessionStore = self.config.session.store ? self.config.session.store.toLowerCase() : undefined;
      switch (sessionStore) {
        case "mongoose":
          let MongoStore = require('connect-mongo')(session);

          sessionConfig.store = new MongoStore({
            mongooseConnection: self.mongoose.connection
          });

          cb(undefined, session(sessionConfig));
          break;

        case "cassandra":
          if (!self.config.cassandra) {
            self.log.error("Cannot use cassandra as a session store because it has not been configured in the config.");
          } else {
            let columns = [
              "sid text",
              "session text",
              "expires timestamp",
              "PRIMARY KEY (sid)"
            ];
            self.cql.createTable("sessions", columns, function (err, result) {
              if(err) {
                cb(err);
              } else {
                cb(undefined, session(sessionConfig));
              }
            })
          }
          break;
        default:
          if (self.config.environment.toLowerCase() === "production") {
            self.log.warn("A session store needs to be defined.");
          }
          cb(undefined, session(sessionConfig));
          break;
      }
    } else {
      cb();
    }
  }

  // Load the application models and endpoints.
  loadSenecaApp (cb) {
    let self = this;
    self.log.trace('Load seneca application models and endpoints.');

    self.cql.loadModels(function(err, models) {
      if(err) {
        cb(err);
      } else {
        self.models = models;

        //Initialize seneca.
        if(self.config.seneca) {
          self.seneca = require('seneca')();
        }

        let crave = require('crave');
        crave.setConfig(self.config.crave);
        // Recursively load all files of the specified type(s) that are also located in the specified folder.
        crave.directory(path.resolve("./app"), ["seneca"], cb, self);
      }
    });
  }


  setResponseHandlers(cb) {
    this.log.trace('Add application error and response handlers.');

    // Final middleware to format standard responses.
    //this.app.use(this.responseHandler.createResponseHandler());

    // Final middleware to format any error responses.
    //this.app.use(this.responseHandler.createErrorHandler());

    this.app = this.riposte.addExpressPostMiddleware(this.app);

    cb();
  }

  // Load static data.
  loadStaticData(cb) {
    let self = this;

    self.log.trace("Loading static data into database.");

    let cramit = require('cramit')();

    cramit.setConfig({
      database: {
        type: 'mongoose',
        instance: require('mongoose')
      },
      fixtureFileSuffix: "data"
    });

    cramit.findAllFixturesAndUpsertData(applicationPath, {}, cb);
  }

  // Start express server and listen on configured port
  startExpressServer(cb) {
    let self = this;

    if(!self.config.seneca.host) {
      getHostIpAddress(function (err, ipAddress) {
        if(err) {
          cb(err);
        } else {
          if(ipAddress) {
            self.config.seneca.host = ipAddress;
          } else {
            self.config.seneca.host = "localhost";
          }

          console.log("Listening with seneca config:", JSON.stringify(self.config.seneca, undefined, 2));
          self.seneca.listen(self.config.seneca);
          self.seneca.ready(cb);
        }
      });
    } else {
      console.log("Seneca config:", JSON.stringify(self.config.seneca, undefined, 2));
      self.seneca.listen(self.config.seneca);
      self.seneca.ready(cb);
    }

    /*
     self.server = self.app.listen(port, function () {
     let serverInfo = this.address();
     let address = (serverInfo.address === "0.0.0.0" || serverInfo.address === "::") ? "localhost" : serverInfo.address;

     self.log.info("Listening on http://%s:%s with the %s config.", address, serverInfo.port, process.env.NODE_ENV || "default");
     cb();
     });
     */
  }

}

util.inherits(Server, EventEmitter);

module.exports = Server;
