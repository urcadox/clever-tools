var _ = require("lodash");
var Bacon = require("baconjs");
var autocomplete = require("cliparse").autocomplete;

var Application = require("./application.js");
var Interact = require("./interact.js");
var Logger = require("../logger.js");



var Addon = module.exports;

Addon.listProviders = function(api) {
  var s_providers = api.products.addonproviders.get().send();
  return s_providers;
};

Addon.getProvider = function(api, providerName) {
  var s_providers = api.products.addonproviders.get().send();

  var s_provider = s_providers.flatMapLatest(function(providers) {
    var provider = _.find(providers, function(p) { return p.id == providerName })
    return provider || new Bacon.Error("invalid provider name");
  });

  return s_provider;
};

Addon.list = function(api, appId, orgaId, showAll) {
  var params = orgaId ? [orgaId, appId] : [appId];

  var s_myAddons =  api.owner(orgaId).applications._.addons.get().withParams(params).send();

  if(!showAll) {
    return s_myAddons;
  } else {
    var s_enrichedAddons = s_myAddons.flatMapLatest(function(myAddons) {
      return api.owner(orgaId).addons.get().withParams(params).send()
            .map(function(allAddons) {
              return allAddons.map(function(a) {
                a.isLinked = _.pluck(myAddons, "id").indexOf(a.id) >= 0;
                return a;
              });
            });
    });

    return s_enrichedAddons;
  }
};

Addon.create = function(api, appId, orgaId, name, providerName, planName, region, skipConfirmation) {
  var s_providers = api.products.addonproviders.get().send();

  var s_provider = s_providers.flatMapLatest(function(providers) {
    var provider = _.find(providers, function(p) { return p.id == providerName })
    if(!provider) return new Bacon.Error("invalid provider name");

    if(!_.contains(provider.regions, region)) return new Bacon.Error("invalid region name. Available regions: " + provider.regions.join(", "));

    return provider;
  });

  var s_plan = s_provider.flatMapLatest(function(provider) {
    var plan = _.find(provider.plans, function(p) { return p.slug == planName; });
    var availablePlans = _.pluck(provider.plans, "slug");
    return plan || new Bacon.Error("invalid plan name. Available plans: " + availablePlans.join(", "));
  });

  var s_confirmedPlan = s_plan.flatMapLatest(function(plan) {
    if(!skipConfirmation && plan.price > 0) {
      var s_confirm = Interact.confirm("This addon costs "+plan.price+"€/month, confirm? ", "No confirmation, aborting addon creation");
      return s_confirm.map(_.constant(plan));
    } else {
      return plan;
    }
  });

  var s_creation = s_confirmedPlan.flatMapLatest(function(plan) {
    return Addon.performCreation(api, orgaId, name, plan.id, providerName, region);
  });

  var s_link = s_creation.flatMapLatest(function(addon) {
    return Addon.link(api, appId, orgaId, addon.id);
  });

  return s_link;
};

Addon.performCreation = function(api, orgaId, name, planId, providerId, region) {
  var params = orgaId ? [orgaId] : [];
  return api.owner(orgaId).addons.post().withParams(params).send(JSON.stringify({
    name: name,
    plan: planId,
    providerId: providerId,
    region: region
  }));
};

Addon.link = function(api, appId, orgaId, addonId) {
  var params = orgaId ? [orgaId, appId] : [appId];

  return api.owner(orgaId).applications._.addons.post().withParams(params).send(JSON.stringify(addonId));
};

Addon.unlink = function(api, appId, orgaId, addonId) {
  var params = orgaId ? [orgaId, appId, addonId] : [appId, addonId];

  return api.owner(orgaId).applications._.addons._.delete().withParams(params).send();
};

Addon.delete = function(api, orgaId, addonId, skipConfirmation) {
  var params = orgaId ? [orgaId, addonId] : [addonId];

  var confirmation = skipConfirmation
    ? Bacon.once()
    : Interact.confirm("Deleting the addon can't be undone, are you sure? ", "No confirmation, aborting addon deletion");

  return confirmation.flatMapLatest(function() {
    return api.owner(orgaId).addons._.delete().withParams(params).send();
  });
};

Addon.rename = function(api, orgaId, addonId, newName) {
  var params = orgaId ? [orgaId, addonId] : [addonId];

  return api.owner(orgaId).addons._.put().withParams(params).send(JSON.stringify({
    name: newName
  }));
};

Addon.completeRegion = function() {
  return autocomplete.words(["eu", "us"]);
};

Addon.completePlan = function() {
  return autocomplete.words(["dev", "s", "m", "l", "xl", "xxl"]);
};
