var fs = require("fs");
var exec = require("child_process").exec;
var path = require("path");
var mkdirp = require("mkdirp");

var _ = require("lodash");
var Bacon = require("baconjs");

var Logger = require("../logger.js");
var conf = require("../models/configuration.js");
var Interact = require("../models/interact.js");

function getOpenCommand() {
  Logger.debug("Get the right command to open a tab in a browser…")
  switch(process.platform) {
    case "darwin":
      return Bacon.constant("open " + conf.CONSOLE_TOKEN_URL);
    case "linux":
      return Bacon.constant("xdg-open " + conf.CONSOLE_TOKEN_URL);
    case "win32":
      return Bacon.constant("start " + conf.CONSOLE_TOKEN_URL);
    default:
      return new Bacon.Error("Unsupported platform: " + process.platform);
  }
}

function runCommand(command) {
  Logger.println("Check your browser to get your tokens…")
  return Bacon.fromBinder(function(sink) {
    exec(command, function(error, stdout, stderr) {
      // Don't consider output in stderr as a blocking error because of
      // firefox
      if(error) {
        sink(new Bacon.Error(error));
      } else {
        sink(stdout);
      }
      sink(new Bacon.End());
    });

    return function(){};
  });
}



function getOAuthData() {
  Logger.debug("Ask for tokens…");
  var s_token = Interact.ask("Enter CLI token: ");
  var s_secret = s_token.flatMapLatest(_.partial(Interact.ask, "Enter CLI secret: "));

  return Bacon.combineTemplate({
    token: s_token,
    secret: s_secret
  });
}

function ensureConfigDir() {
  return Bacon.fromNodeCallback(
    mkdirp,
    path.dirname(conf.CONFIGURATION_FILE,
    { mode: parseInt('0700', 8) }));
}

function writeLoginConfig(oauthData) {
  Logger.debug("Write the tokens in the configuration file…")
  return ensureConfigDir()
    .flatMapLatest(
      Bacon.fromNodeCallback(
        _.partial(fs.writeFile, conf.CONFIGURATION_FILE, JSON.stringify(oauthData))));
}

var login = module.exports = function(api, params) {
  Logger.debug("Try to login to Clever Cloud…")
  var result = getOpenCommand()
    .flatMapLatest(runCommand)
    .flatMapLatest(getOAuthData)
    .flatMapLatest(writeLoginConfig)
    .map(conf.CONFIGURATION_FILE + " has been updated.");

  result.onValue(Logger.println);
  result.onError(Logger.error);
};
