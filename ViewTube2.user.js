// ==UserScript==
// @name       ViewTube2
// @namespace  futpib/ViewTube2
// @version    2013.06.06
// @description    Watch videos from video sharing websites without Flash Player
// @include    http*
// @require    http://ajax.googleapis.com/ajax/libs/jquery/2.0.2/jquery.min.js
// @grant      none
// ==/UserScript==


/*
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program. If not, see <http://www.gnu.org/licenses/>.
*/


const DEBUG = true;
// const DEBUG = false;

if (DEBUG)
  var log = console.log;
else
  var log = function(){};


function viewTube2Main() {

this.$ = this.jQuery = jQuery.noConflict(true);

function itemgetter(itemName) {
  return function (object) {
    return object[itemName];
  };
}

Array.prototype.contains = function(item) {
  return this.indexOf(item) != -1;
}
Array.prototype.extend = function(array) {
  this.push.apply(this, array);
}
Array.prototype.intersection = function(array) {
  return this.filter(function(x){return array.contains(x)});
}
Array.prototype.unique = function() {
  var unique = [];
  this.forEach(function (x) {
    if (!unique.contains(x))
      unique.push(x);
  });
  return unique;
}
Array.prototype.max = function() {
  return Math.max.apply(null, this);
};
Array.prototype.min = function() {
  return Math.min.apply(null, this);
};

function toPNotation(i) {
  return i + 'p';
}
function parsePNotation(s) {
  return parseInt( s.match(/(\d+)p/)[1] );
}

/*
 * Controls
 */

function Button (text) {
  this.node = $('<button></button>');
  if (text)
    this.node.text(text);
}

function Select (options) {
  this.node = $('<select></select>');

  if (options)
    this.options = options;
}

Select.prototype = {
  set options (options) {
    this.node.find('option').remove();
    var select = this
    options.forEach(function(option){
      var optionNode = $('<option></option>');
      optionNode.text(option);
      optionNode.attr('value', option);
      select.node.append(optionNode);
    });
  },
  get value () {
    return this.node.val();
  },
  set value (v) {
    this.node.val(v);
    this.node.trigger('change');
  },

  change : function () {
    this.node.change.apply(this.node, arguments);
  },
}

function VideoControls () {
  this.node = $('<div></div>');
  this.node.height(20);

  this.resolutionSelect = new Select();
  this.node.append(this.resolutionSelect.node);
}

VideoControls.prototype = {
  set resolution (res) {
    this.resolutionSelect.value = toPNotation(res);
  },
  get resolution () {
    return parsePNotation(this.resolutionSelect.value);
  },

  attachToVideo : function (video) {
    this.video = video;
    video.setControls(this);
    this.resolutionSelect.options = video.availableResolutions.map(toPNotation);
  },

  resolutionChange : function () {
    this.resolutionSelect.change.apply(this.resolutionSelect, arguments);
  },
}

/*
 * Hostings
 */

/* YouTube */

function YouTubeVideo (originalPlayerNode) {
  this.node = $('<div></div>');

  var old = originalPlayerNode;

  // get youtube video id
  idMatch = (old.attr('flashvars') || '')
            .match(/video_id=([0-9a-zA-Z_-]{11})/);
  if (!idMatch)
    idMatch = (old.attr('src') || '')
              .match(/youtube\.com\/v\/([0-9a-zA-Z_-]{11})/);
  if (!idMatch)
    throw new Error("Can't get youtube video id");
  this.id = idMatch[1];

  // prevent youtube's scripts from restoring original player
  if (YouTubeHosting._isOnWatchPage) {
    var parentNode = old.parent()[0];
    Object.defineProperty(parentNode, "innerHTML", {
      value : parentNode.innerHTML,
      writable : false,
    });
  }

  this.node.insertAfter(old);
  this.node.width(old.width()); this.node.height(old.height());

  old.remove();
};

YouTubeVideo.prototype = {
  get _watchPageHtml () {
    var value;
    if (YouTubeHosting._isOnWatchPage) {
      value = document.documentElement.innerHTML;
    } else {
      $.ajax({
        async: false,
        type: 'GET', dataType: 'html',
        url: 'http://www.youtube.com/watch?v=' + this.id,
        success: function(data) {
          value = data;
        },
      });
    }

    Object.defineProperty(this, '_watchPageHtml', {value:value});
    return value;
  },

  get _config () {
    var configRe = /ytplayer\.config\s*=\s*({.*?})\s*;/;
    var configMatch = this._watchPageHtml.match(configRe);
    var value = $.parseJSON(configMatch[1]);

    Object.defineProperty(this, '_config', {value:value});
    return value;
  },

  get _streams () {
    var encodedStreamMap = this._config.args.url_encoded_fmt_stream_map;
    var streams = encodedStreamMap.split(',').map(function (rawStream) {
      var stream = {};
      rawStream.split('&').forEach(function (pair) {
        pair = pair.split('=');
        var key = pair[0], value = pair[1];
        value = decodeURIComponent(value);
        stream[key] = value;
      });
      stream.url += '&signature=' + stream.sig;
      return stream;
    });
    var value = streams;

    Object.defineProperty(this, '_streams', {value:value});
    return value;
  },

  get _itagResolutionMap () {
    var rawList = this._config.args.fmt_list;
    var value = {};
    rawList.split(',').forEach(function(fmt){
      fmt = fmt.split('/');
      var itag = fmt[0], resolution = fmt[1];
      resolution = resolution.match(/\d+x(\d+)/)[1];
      value[itag] = parseInt(resolution);
    });

    Object.defineProperty(this, '_itagResolutionMap', {value:value});
    return value;
  },

  get availableStreams () {
    var itagRes = this._itagResolutionMap;
    var streams = this._streams.map(function (stream) {
      var streamObj = {
        format : stream.type.split(';')[0],
        resolution : itagRes[stream.itag],
        url : stream.url,
      };
      return streamObj;
    });
    var value = streams;

    Object.defineProperty(this, 'availableStreams', {value:value});
    return value;
  },

  get availableFormats () {
    return this.availableStreams.map(itemgetter('format')).unique();
  },

  get availableResolutions () {
    return this.availableStreams.map(itemgetter('resolution')).unique();
  },

  updateLayout : function () {
    // TODO find nice HTML+CSS solution
    if (!this.player)
      return;
    this.player.size = [
      '100%',
      this.node.height() - ((this.controls) ? this.controls.node.height() : 0)
    ];
  },

  setPlayer : function(player) {
    if (this.player)
      this.player.node.remove();
    this.node.prepend(player.node);
    this.player = player;

    this.updateLayout();
  },

  setControls : function(controls) {
    this.node.append(controls.node);
    this.controls = controls;

    var thatYTVideo = this;
    this.controls.resolutionChange(function(){
      var preferredStream = prefs.bestStream(
        thatYTVideo.availableStreams,
        {resolution: thatYTVideo.controls.resolution}
      );
      var Player = prefs.bestPlayerForStream(preferredStream);
      thatYTVideo.setPlayer(new Player());
      thatYTVideo.player.stream = preferredStream;
    });

    this.updateLayout();
  },
}

var YouTubeHosting = {
  _isOnWatchPage : /^https?:\/\/www\.youtube\.com\/watch\?([^&]+&)*v=/
                    .test(document.URL),

  findVideos : function () {
    var videos = [];

    var embeds = $(
        'embed[src*="ytimg.com/yts/swfbin/"]'
      + ', embed[src*="youtube.com/v/"]'
    );
    log("youtube embeds: ", embeds);
    embeds.each(function(i, embed){
      var video = new YouTubeVideo($(embed));
      videos.push(video);
    });

    return videos;
  },
}

/*
 * Players
 */

function Html5Player() {
  this.node = $('<video></video>');
  this.node.attr('controls', '');
  if (YouTubeHosting._isOnWatchPage)
    this.node.attr('preload', '');
  this.node.css('outline', 'none'); // hide selected outline (firefox adds one)
}

Html5Player.prototype = {
  set stream (newStream) {
    this.node.attr('src', newStream.url);
  },
  set size (newSize) {
    this.node.width(newSize[0]);
    this.node.height(newSize[1]);
  },
};

Html5Player.supportedFormats = (function(){
  // according to https://developer.mozilla.org/en-US/docs/HTML/Supported_media_formats
  value = ['video/webm', 'video/mp4'];
//   if (/Mac|Win/.test(navigator.platform))
//     value.push('video/mp4');
  if (/Mac/.test(navigator.platform))
    value.push('video/quicktime');

  return value;
})();


function VlcPlayer() {
  this.node = $('<div></div>');

  this.embed = $('<embed type="application/x-vlc-plugin">');
  this.embed.width('100%');
  this.embed.height('100%');

  this.node.append(this.embed);
}

VlcPlayer.prototype = {
  set stream (newStream) {
    this.node.attr('target', newStream.url);
  },
  set size (newSize) {
    this.node.width(newSize[0]);
    this.node.height(newSize[1]);
  },
};

VlcPlayer.supportedFormats = (function(){
  // according to http://www.videolan.org/vlc/features.php?cat=video
  value = ['video/mp4', 'video/x-flv', 'video/webm', 'video/3gpp', ];

  return value;
})();


/*
 * Preferences
 */

var hostings = [YouTubeHosting, ];
var players = [Html5Player, VlcPlayer, ];

var prefs = {
  bestStream : function (streams, filters) {
    streams = streams.filter(function(stream){
      for (f in filters) {
        if (stream[f] != filters[f])
          return false
      }
      return true;
    });

    var rs = streams.map(itemgetter('resolution')).unique();
    var bestRes = rs.filter(function(r){
      return r <= 720;
    }).max();

    var fs = streams.map(itemgetter('format')).unique();
    var bestFormat = false;
    if (fs.contains('video/webm'))
      var bestFormat = 'video/webm';

    var best = streams.filter(function(stream){
      if (bestRes && stream.resolution != bestRes)
        return false;
      if (bestFormat && stream.format != bestFormat)
        return false;
      return true;
    })[0];

    if (!best)
      throw "Best stream selection falied.";
    return best;
  },

  bestPlayerForStream : function (stream) {
    return players.filter(function(p){
      return p.supportedFormats.contains(stream.format);
    })[0];
  },
}

/*
 * Main
 */

hostings.forEach(function(hosting){
  var videos = hosting.findVideos();
  log("videos: ", videos);
  videos.forEach(function(video){
    var preferredStream = prefs.bestStream(video.availableStreams);

    var Player = prefs.bestPlayerForStream(preferredStream);
    var controls = new VideoControls();

    controls.attachToVideo(video);
    video.setPlayer(new Player());
    controls.resolution = preferredStream.resolution;
  });
});

}

if (DEBUG) {
  try {
    viewTube2Main();
  } catch (e) {
    // oterwise exceptions are silently ignored (ff, greasemonkey, firebug)
    console.log('ViewTube2 unhandled exception: ', e);
  }
} else {
  viewTube2Main();
}
