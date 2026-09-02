const youtubedl = require('youtube-dl-exec');
youtubedl('https://www.youtube.com/live/c4ppitf3aDY?si=FahvD1PRhaQUM-3x', {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificate: true,
    preferFreeFormats: true,
    youtubeSkipDashManifest: true
}).then(info => {
    console.log("Success! Title:", info.title);
}).catch(err => {
    console.error("Error:", err);
});
