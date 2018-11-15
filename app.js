const http = require('http');

const cheerio = require('cheerio');
const request = require('request');

const hostname = '127.0.0.1';
const port = 3000;

request({
    method: 'GET',
    url: 'https://www.google.com/search?q=define+vitriol',
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36"
    }
}, function(err, response, body) {
    if (err) {
        return console.error(err);
    }

    var $ = cheerio.load(body);

    // var a = $(".mw").text();

    var a = $(".vmod").text();
    var googledef = parseGoogleDefinition(a);
    


    const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end(googledef);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});


});

function parseGoogleDefinition(definition) {
    var firstDefIndex = definition.indexOf("1.");
    var secondDefIndex = definition.indexOf("2. ");
    console.log(firstDefIndex);
    console.log(secondDefIndex);
    if (firstDefIndex == -1) { return "" }
    var firstDef = definition.slice(firstDefIndex+2, secondDefIndex != -1 ? secondDefIndex : undefined);
    return firstDef;
}

/*

l/nounnoun: vitriol1. cruel and bitter criticism."her mother's sudden gush of fury and vitriol"2. archaicâ€¢literarysulfuric acid.Originlate Middle English (denoting the sulfate of various metals): from Old French, or from medieval Latin vitriolum, from Latin vitrum â€˜glass.â€™/ËˆvitrÄ“É™l,ËˆvitrÄ“ËŒÃ´

*/