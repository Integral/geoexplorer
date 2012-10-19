jQuery(function($) {
  window.ReclineDataExplorer = new ExplorerApp({
    el: $('.recline-app')
  })
});

var ExplorerApp = Backbone.View.extend({
  events: {
    'click .nav .js-load-dialog-url': '_onLoadURLDialog',
    'submit form.js-load-url': '_onLoadURL',
    'submit .js-load-dialog-file form': '_onLoadFile',
    'submit .js-settings form': '_onSettingsSave'
  },

  initialize: function() {
    this.el = $(this.el);
    this.dataExplorer = null;
    this.explorerDiv = $('.data-explorer-here');
    _.bindAll(this, 'viewExplorer', 'viewHome');

    this.router = new Backbone.Router();
    this.router.route('', 'home', this.viewHome);
    this.router.route(/explorer/, 'explorer', this.viewExplorer);
    Backbone.history.start();

    var state = recline.View.parseQueryString(decodeURIComponent(window.location.search));
    if (state) {
      _.each(state, function(value, key) {
        try {
          value = JSON.parse(value);
        } catch(e) {}
        state[key] = value;
      });
      if (state.embed) {
        $('.navbar').hide();
        $('body').attr('style', 'padding-top: 0px');
      }
    }
    var dataset = null;
    // special cases for demo / memory dataset
    if (state.url === 'demo' || state.backend === 'memory') {
      dataset = localDataset();
    }
    else if (state.dataset || state.url) {
      var datasetInfo = _.extend({
          url: state.url,
          backend: state.backend
        },
        state.dataset
      );
      dataset = new recline.Model.Dataset(datasetInfo);
    }
    if (dataset) {
      this.createExplorer(dataset, state);
    }
    this._initializeSettings();
  },

  viewHome: function() {
    this.switchView('home');
  },

  viewExplorer: function() {
    this.router.navigate('explorer');
    this.switchView('explorer');
  },

  switchView: function(path) {
    $('.backbone-page').hide(); 
    var cssClass = path.replace('/', '-');
    $('.page-' + cssClass).show();
  },


  // make Explorer creation / initialization in a function so we can call it
  // again and again
  createExplorer: function(dataset, state) {
    var self = this;
    // remove existing data explorer view
    var reload = false;
    if (this.dataExplorer) {
      this.dataExplorer.remove();
      reload = true;
    }
    this.dataExplorer = null;
    var $el = $('<div />');
    $el.appendTo(this.explorerDiv);
    var views = [
       {
         id: 'grid',
         label: 'Таблица', 
         view: new recline.View.SlickGrid({
           model: dataset
         })
       },

       {
         id: 'graph',
         label: 'График',
         view: new recline.View.Graph({
           model: dataset
         })
       },
       {
         id: 'map',
         label: 'Карта',
         view: new recline.View.Map({
           model: dataset
         })
       },
       {
         id: 'timeline',
         label: 'Timeline',
         view: new recline.View.Timeline({
           model: dataset
         })
       }
    ];

    this.dataExplorer = new recline.View.MultiView({
      model: dataset,
      el: $el,
      state: state,
      views: views
    });
    this._setupPermaLink(this.dataExplorer);
    this._setupEmbed(this.dataExplorer);

    this.viewExplorer();
  },

  _setupPermaLink: function(explorer) {
    var self = this;
    var $viewLink = this.el.find('.js-share-and-embed-dialog .view-link');
    explorer.state.bind('change', function() {
      $viewLink.val(self.makePermaLink(explorer.state));
    });
    $viewLink.val(self.makePermaLink(explorer.state));
  },

  _setupEmbed: function(explorer) {
    var self = this;
    var $embedLink = this.el.find('.js-share-and-embed-dialog .view-embed');
    function makeEmbedLink(state) {
      var link = self.makePermaLink(state);
      link = link + '&amp;embed=true';
      var out = Mustache.render('<iframe src="{{link}}" width="100%" min-height="500px;"></iframe>', {link: link});
      return out;
    }
    explorer.state.bind('change', function() {
      $embedLink.val(makeEmbedLink(explorer.state));
    });
    $embedLink.val(makeEmbedLink(explorer.state));
  },

  makePermaLink: function(state) {
    var qs = recline.View.composeQueryString(state.toJSON());
    return window.location.origin + window.location.pathname + qs;
  },

  // setup the loader menu in top bar
  setupLoader: function(callback) {
    // pre-populate webstore load form with an example url
    var demoUrl = 'http://thedatahub.org/api/data/b9aae52b-b082-4159-b46f-7bb9c158d013';
    $('form.js-load-url input[name="source"]').val(demoUrl);
  },

  _onLoadURLDialog: function(e) {
    e.preventDefault();
    var $link = $(e.target);
    var $modal = $('.modal.js-load-dialog-url');
    $modal.find('h3').text($link.text());
    $modal.modal('show');
    $modal.find('input[name="source"]').val('');
    $modal.find('input[name="backend_type"]').val($link.attr('data-type'));
    $modal.find('.help-block').text($link.attr('data-help'));
  },

  _onLoadURL: function(e) {
    e.preventDefault();
    $('.modal.js-load-dialog-url').modal('hide');
    var $form = $(e.target);
    var source = $form.find('input[name="source"]').val();
    var datasetInfo = {
      id: 'my-dataset',
      url: source
    };
    var type = $form.find('input[name="backend_type"]').val();
    if (type === 'csv' || type === 'excel') {
      datasetInfo.format = type;
      type = 'dataproxy';
    }
    if (type === 'datahub') {
      // have a full resource url so convert to data API
      if (source.indexOf('dataset') != -1) {
        var parts = source.split('/');
        datasetInfo.url = parts[0] + '/' + parts[1] + '/' + parts[2] + '/api/data/' + parts[parts.length-1];
      }
      type = 'elasticsearch';
    }
    datasetInfo.backend = type;
    var dataset = new recline.Model.Dataset(datasetInfo);
    this.createExplorer(dataset);
  },

  _onLoadFile: function(e) {
    var self = this;
    e.preventDefault();
    var $form = $(e.target);
    $('.modal.js-load-dialog-file').modal('hide');
    var $file = $form.find('input[type="file"]')[0];
    var dataset = new recline.Model.Dataset({
      file: $file.files[0],
      separator : $form.find('input[name="separator"]').val(),
      delimiter : $form.find('input[name="delimiter"]').val(),
      encoding : $form.find('input[name="encoding"]').val(),
      backend: 'csv'
    });
    dataset.fetch().done(function() {
      self.createExplorer(dataset)
    });
  },

  _getSettings: function() {
    var settings = localStorage.getItem('dataexplorer.settings');
    settings = JSON.parse(settings) || {};
    return settings;
  },

  _initializeSettings: function() {
    var settings = this._getSettings();
    $('.modal.js-settings form input[name="datahub_api_key"]').val(settings.datahubApiKey);
  },

  _onSettingsSave: function(e) {
    var self = this;
    e.preventDefault();
    var $form = $(e.target);
    $('.modal.js-settings').modal('hide');
    var datahubKey = $form.find('input[name="datahub_api_key"]').val();
    var settings = this._getSettings();
    settings.datahubApiKey = datahubKey;
    localStorage.setItem('dataexplorer.settings', JSON.stringify(settings));
  }
});

// provide a demonstration in memory dataset
function localDataset() {
  var records = [
{ "type": "Feature", "properties": { "SCALERANK": 6, "NATSCALE": 30, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "San Jose de Mayo", "NAMEPAR": "", "NAMEALT": "San Jose De Mayo", "DIFFASCII": 0, "NAMEASCII": "San Jose de Mayo", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "San José", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -34.349959, "LONGITUDE": -56.709986, "CHANGED": 1.000000, "NAMEDIFF": 0, "DIFFNOTE": "Changed scale rank.", "POP_MAX": 36529, "POP_MIN": 36395, "POP_OTHER": 36395, "GEONAMEID": 3440639.000000, "MEGANAME": "", "LS_NAME": "San Jose de Mayo", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6312926.742238, -4100109.963078 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 8, "NATSCALE": 10, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "Artigas", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Artigas", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Artigas", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -30.415987, "LONGITUDE": -56.486020, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 41909, "POP_MIN": 22236, "POP_OTHER": 22236, "GEONAMEID": 3443758.000000, "MEGANAME": "", "LS_NAME": "Artigas", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6287994.999284, -3578871.300376 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 8, "NATSCALE": 10, "LABELRANK": 8, "FEATURECLA": "Populated place", "NAME": "Baltasar Brum", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Baltasar Brum", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Artigas", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -30.730025, "LONGITUDE": -57.319974, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 2517, "POP_MIN": 2347, "POP_OTHER": 0, "GEONAMEID": 3443697.000000, "MEGANAME": "", "LS_NAME": "Baltasar Brum", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6380830.363334, -3619676.612889 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 7, "NATSCALE": 20, "LABELRANK": 8, "FEATURECLA": "Populated place", "NAME": "Bella Union", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Bella Union", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Artigas", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -30.259614, "LONGITUDE": -57.599957, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 22723, "POP_MIN": 13171, "POP_OTHER": 22723, "GEONAMEID": 3443631.000000, "MEGANAME": "", "LS_NAME": "Bella Union", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6411997.918324, -3558601.105551 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 7, "NATSCALE": 20, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "Mercedes", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Mercedes", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Soriano", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -33.259534, "LONGITUDE": -58.029983, "CHANGED": 1.000000, "NAMEDIFF": 0, "DIFFNOTE": "Changed scale rank.", "POP_MAX": 42359, "POP_MIN": 41544, "POP_OTHER": 46075, "GEONAMEID": 3441684.000000, "MEGANAME": "", "LS_NAME": "Mercedes3", "LS_MATCH": 1, "CHECKME": 5 }, "geometry": { "type": "Point", "coordinates": [ -6459868.130366, -3953346.433778 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 7, "NATSCALE": 20, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "Melo", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Melo", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Cerro Largo", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -32.359486, "LONGITUDE": -54.179985, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 55494, "POP_MIN": 51023, "POP_OTHER": 55343, "GEONAMEID": 3441702.000000, "MEGANAME": "", "LS_NAME": "Melo", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6031288.362586, -3833569.255115 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 8, "NATSCALE": 10, "LABELRANK": 8, "FEATURECLA": "Populated place", "NAME": "Tranqueras", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Tranqueras", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Rivera", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -31.200022, "LONGITUDE": -55.749967, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 7474, "POP_MIN": 2077, "POP_OTHER": 0, "GEONAMEID": 3439787.000000, "MEGANAME": "", "LS_NAME": "Tranqueras", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6206057.924812, -3680993.891751 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 7, "NATSCALE": 20, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "Rivera", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Rivera", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Rivera", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -30.899575, "LONGITUDE": -55.560004, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 132119, "POP_MIN": 64631, "POP_OTHER": 51548, "GEONAMEID": 3440781.000000, "MEGANAME": "", "LS_NAME": "Rivera", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6184911.388794, -3641762.261205 ] } },
{ "type": "Feature", "properties": { "SCALERANK": 8, "NATSCALE": 10, "LABELRANK": 8, "FEATURECLA": "Admin-1 capital", "NAME": "Tacuarembo", "NAMEPAR": "", "NAMEALT": "", "DIFFASCII": 0, "NAMEASCII": "Tacuarembo", "ADM0CAP": 0.000000, "CAPALT": 0.000000, "CAPIN": "", "WORLDCITY": 0.000000, "MEGACITY": 0, "SOV0NAME": "Uruguay", "SOV_A3": "URY", "ADM0NAME": "Uruguay", "ADM0_A3": "URY", "ADM1NAME": "Tacuarembó", "ISO_A2": "UY", "NOTE": "", "LATITUDE": -31.709965, "LONGITUDE": -55.980005, "CHANGED": 0.000000, "NAMEDIFF": 0, "DIFFNOTE": "", "POP_MAX": 54277, "POP_MIN": 51854, "POP_OTHER": 54277, "GEONAMEID": 3440034.000000, "MEGANAME": "", "LS_NAME": "Tacuarembo", "LS_MATCH": 1, "CHECKME": 0 }, "geometry": { "type": "Point", "coordinates": [ -6231665.597576, -3747864.863578 ] } }
  ];
  var dataset = new recline.Model.Dataset({
    records: records,
    fields: [
      {id: 'id'},
      {id: 'date', type: 'date'},
      {id: 'x'},
      {id: 'y'},
      {id: 'z'},
      {id: 'country', 'label': 'Country'},
      {id: 'title', 'label': 'Title'},
      {id: 'lat'},
      {id: 'lon'}
    ]
  });
  return dataset;
}

