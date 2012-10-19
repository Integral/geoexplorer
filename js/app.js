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
	{
		"SCALERANK": "7",
		"NATSCALE": "20",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Carmelo",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Carmelo",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Colonia",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-33.98961912150",
		"LONGITUDE": "-58.29999210780",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "16921",
		"POP_MIN": "13306",
		"POP_OTHER": "13306",
		"GEONAMEID": "3443341.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Carmelo",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "6",
		"NATSCALE": "30",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "San Jose de Mayo",
		"NAMEPAR": "",
		"NAMEALT": "San Jose De Mayo",
		"DIFFASCII": "0",
		"NAMEASCII": "San Jose de Mayo",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "San José",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-34.34995888390",
		"LONGITUDE": "-56.70998580080",
		"CHANGED": "1.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "Changed scale rank.",
		"POP_MAX": "36529",
		"POP_MIN": "36395",
		"POP_OTHER": "36395",
		"GEONAMEID": "3440639.00000000000",
		"MEGANAME": "",
		"LS_NAME": "San Jose de Mayo",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Artigas",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Artigas",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Artigas",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-30.41598712280",
		"LONGITUDE": "-56.48602014320",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "41909",
		"POP_MIN": "22236",
		"POP_OTHER": "22236",
		"GEONAMEID": "3443758.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Artigas",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Baltasar Brum",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Baltasar Brum",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Artigas",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-30.73002480190",
		"LONGITUDE": "-57.31997440760",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "2517",
		"POP_MIN": "2347",
		"POP_OTHER": "0",
		"GEONAMEID": "3443697.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Baltasar Brum",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "7",
		"NATSCALE": "20",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Bella Union",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Bella Union",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Artigas",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-30.25961423870",
		"LONGITUDE": "-57.59995731770",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "22723",
		"POP_MIN": "13171",
		"POP_OTHER": "22723",
		"GEONAMEID": "3443631.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Bella Union",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "7",
		"NATSCALE": "20",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Mercedes",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Mercedes",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Soriano",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-33.25953448610",
		"LONGITUDE": "-58.02998274900",
		"CHANGED": "1.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "Changed scale rank.",
		"POP_MAX": "42359",
		"POP_MIN": "41544",
		"POP_OTHER": "46075",
		"GEONAMEID": "3441684.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Mercedes3",
		"LS_MATCH": "1",
		"CHECKME": "5"
	},
	{
		"SCALERANK": "7",
		"NATSCALE": "20",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Melo",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Melo",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Cerro Largo",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-32.35948606490",
		"LONGITUDE": "-54.17998519040",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "55494",
		"POP_MIN": "51023",
		"POP_OTHER": "55343",
		"GEONAMEID": "3441702.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Melo",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Tranqueras",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Tranqueras",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Rivera",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-31.20002195360",
		"LONGITUDE": "-55.74996687990",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "7474",
		"POP_MIN": "2077",
		"POP_OTHER": "0",
		"GEONAMEID": "3439787.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Tranqueras",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "7",
		"NATSCALE": "20",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Rivera",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Rivera",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Rivera",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-30.89957517620",
		"LONGITUDE": "-55.56000431480",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "132119",
		"POP_MIN": "64631",
		"POP_OTHER": "51548",
		"GEONAMEID": "3440781.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Rivera",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Tacuarembo",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Tacuarembo",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Tacuarembó",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-31.70996498740",
		"LONGITUDE": "-55.98000451820",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "54277",
		"POP_MIN": "51854",
		"POP_OTHER": "54277",
		"GEONAMEID": "3440034.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Tacuarembo",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Paso de los Toros",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Paso de los Toros",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Tacuarembó",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-32.81000120160",
		"LONGITUDE": "-56.51004968430",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "13221",
		"POP_MIN": "9679",
		"POP_OTHER": "9679",
		"GEONAMEID": "3441273.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Paso de los Toros",
		"LS_MATCH": "1",
		"CHECKME": "2"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Vergara",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Vergara",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Treinta y Tres",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-32.92999387740",
		"LONGITUDE": "-53.94999922850",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "3998",
		"POP_MIN": "3500",
		"POP_OTHER": "0",
		"GEONAMEID": "3439622.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Vergara",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Treinta y Tres",
		"NAMEPAR": "",
		"NAMEALT": "Treinta Y Tres",
		"DIFFASCII": "0",
		"NAMEASCII": "Treinta y Tres",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Treinta y Tres",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-33.23002724330",
		"LONGITUDE": "-54.38002465980",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "27684",
		"POP_MIN": "25653",
		"POP_OTHER": "27684",
		"GEONAMEID": "3439781.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Treinta y Tres",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Santa Lucia",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Santa Lucia",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Canelones",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-34.47000323610",
		"LONGITUDE": "-56.39997888350",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "16438",
		"POP_MIN": "14091",
		"POP_OTHER": "0",
		"GEONAMEID": "3440571.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Santa Lucia",
		"LS_MATCH": "1",
		"CHECKME": "1"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Populated place",
		"NAME": "Jose Batlle y Ordonez",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Jose Batlle y Ordonez",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Lavalleja",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-33.47001259480",
		"LONGITUDE": "-55.12000533200",
		"CHANGED": "4.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "Population from GeoNames.",
		"POP_MAX": "2438",
		"POP_MIN": "2438",
		"POP_OTHER": "0",
		"GEONAMEID": "3442233.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Jose Batlle y Ordonez",
		"LS_MATCH": "0",
		"CHECKME": "1"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Minas",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Minas",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Lavalleja",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-34.37000933960",
		"LONGITUDE": "-55.23002445640",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "41180",
		"POP_MIN": "38025",
		"POP_OTHER": "41032",
		"GEONAMEID": "3441665.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Minas",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Maldonado",
		"NAMEPAR": "",
		"NAMEALT": "",
		"DIFFASCII": "0",
		"NAMEASCII": "Maldonado",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Maldonado",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-34.91002805710",
		"LONGITUDE": "-54.95998925940",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "55478",
		"POP_MIN": "48277",
		"POP_OTHER": "44128",
		"GEONAMEID": "3441894.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Maldonado",
		"LS_MATCH": "1",
		"CHECKME": "0"
	},
	{
		"SCALERANK": "8",
		"NATSCALE": "10",
		"LABELRANK": "8",
		"FEATURECLA": "Admin-1 capital",
		"NAME": "Punta del Este",
		"NAMEPAR": "",
		"NAMEALT": "Maldonado",
		"DIFFASCII": "0",
		"NAMEASCII": "Punta del Este",
		"ADM0CAP": "0.00000000000",
		"CAPALT": "0.00000000000",
		"CAPIN": "",
		"WORLDCITY": "0.00000000000",
		"MEGACITY": "0",
		"SOV0NAME": "Uruguay",
		"SOV_A3": "URY",
		"ADM0NAME": "Uruguay",
		"ADM0_A3": "URY",
		"ADM1NAME": "Maldonado",
		"ISO_A2": "UY",
		"NOTE": "",
		"LATITUDE": "-34.96997271850",
		"LONGITUDE": "-54.94998986980",
		"CHANGED": "0.00000000000",
		"NAMEDIFF": "0",
		"DIFFNOTE": "",
		"POP_MAX": "7234",
		"POP_MIN": "141",
		"POP_OTHER": "9764",
		"GEONAMEID": "3440939.00000000000",
		"MEGANAME": "",
		"LS_NAME": "Punta del Este",
		"LS_MATCH": "1",
		"CHECKME": "0"
	}
]
  var dataset = new recline.Model.Dataset({
    records: records,
    fields: [
      {id: 'id'},
      {id: 'date', type: 'date'},
      {id: 'POP_MAX'},
      {id: 'POP_MIN'},
      {id: 'POP_OTHER'},
      {id: 'country', 'label': 'Country'},
      {id: 'NAME', 'label': 'Title'},
      {id: 'LATITUDE'},
      {id: 'LONGITUDE'}
    ]
  });
  return dataset;
}

