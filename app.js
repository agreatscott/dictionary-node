const dotenv = require('dotenv').config()
const http = require('http');
const assert = require('assert');

const cheerio = require('cheerio');
const request = require('request');

const hostname = '127.0.0.1';
const port = 3000; 

// const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true });

const mysql = require('mysql');

const searchTermQuery = 'SELECT term, term_definition, datetime_defined FROM word_definitions WHERE term = \'';
var con = mysql.createConnection({ // requires dotenv configuration
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});



const server = http.createServer((req, res) => {

    var term = req.url.slice(1).trim();

    con.query(searchTermQuery.concat(term).concat('\''), function (error, result, fields) {
        if (error) throw error;
        if (term == 'favicon.ico') return;

        if (result.length == 0) { //if we don't have def, go get it. 
            console.log(term + ' not in database, looking up definition...');
            request({
                method: 'GET',
                url: 'https://www.google.com/search?q=define+' + req.url.slice(1).trim(),
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36"
                }
            }, function (err, response, body) {
                if (err) {
                    return console.error(err);
                }
                console.log('google definition request for ' + term + ' received!');

                var $ = cheerio.load(body);

                // var a = $(".vmod").text();
                var a = $("#ires").find('ol').text();
                //console.log(a);
                var googledef = parseGoogleDefinition(a);

                //insertDef(con, term, googledef);
                console.log(googledef);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end(a);
                console.log(' *********** END OF REQUEST ***************\n');
            });
        }
        else {
            console.log(term + ' found in database!');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');

            res.end(result[0].term_definition);
            console.log(' *********** END OF REQUEST ***************\n');

        }
    });





});


server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function parseGoogleDefinition(fullGoogleDefinition) {
    var parsedDefArr = [];
    var firstNumericDefIndex = fullGoogleDefinition.indexOf('1.');
    if (firstNumericDefIndex > 5 || firstNumericDefIndex < 0) { //there aren't multiple definitions
        //take everything up to 'synonyms'
        var endPointIndex = fullGoogleDefinition.indexOf('synonym');
        if (endPointIndex != -1) {
            parsedDefArr.push(checkSentenceFormatting(fullGoogleDefinition.slice(0, endPointIndex)));
        }
    }
    else { //the text starts with 1 - there are multiple definitions to look for.
        var definitionNumber = 1;
        while (fullGoogleDefinition.indexOf(definitionNumber.toString() + '.') != -1) {
            console.log(definitionNumber);
            var currentDefinitionStartIndex = fullGoogleDefinition.indexOf(definitionNumber.toString() + '.');
            console.log("start " + currentDefinitionStartIndex);

            fullGoogleDefinition = fullGoogleDefinition.slice(currentDefinitionStartIndex); //cut off any extra at front of string
            fullGoogleDefinition = trimDefinition(fullGoogleDefinition); //also trim the starter thingy

            var currentDefinitionEndIndex = findCurrentDefinitionEndIndex(fullGoogleDefinition);
            console.log('end ' + currentDefinitionEndIndex);
            var currentDefinition = fullGoogleDefinition.slice(0, currentDefinitionEndIndex); //extract current definition

            currentDefinition = checkSentenceFormatting(currentDefinition);
            parsedDefArr.push(currentDefinition.trim());

            fullGoogleDefinition = fullGoogleDefinition.slice(currentDefinitionEndIndex); //cut off current definition just added to array.
            definitionNumber++;
        }

        console.log('\n\n\n');
    }
    return parsedDefArr;
}

const insertDef = function (con, word, definition) {
    const addDefinitionQuery = 'INSERT INTO word_definitions (term, term_definition) VALUES (\'';
    var completeQuery = addDefinitionQuery.concat(word).concat('\', \'').concat(definition).concat('\')')
    console.log(completeQuery);
    con.query(completeQuery, function (err, result) {
        if (err) throw err;
        console.log("successfully added one new definition for " + word);
    });
}


//helper functions
const findCurrentDefinitionEndIndex = function (fullDefinition) {
    const possibleEnds = ['synonym', '1. '];
    //return the lowest index of all the possible ends, that's greater than -1.
    var currentDefinitionEndIndex = -1;
    possibleEnds.forEach(possibleEnd => {
        console.log('possible end ' + possibleEnd);
        var possibleEndIndex = fullDefinition.indexOf(possibleEnd)
        console.log('possible end index: ' + possibleEndIndex);
        if (currentDefinitionEndIndex == -1 || possibleEndIndex < currentDefinitionEndIndex) {
            currentDefinitionEndIndex = possibleEndIndex;
        }
    });
    if (currentDefinitionEndIndex == -1) console.log("couldn't find current definition end via existing possible ends");
    return currentDefinitionEndIndex;
}

const trimDefinition = function (fullDefinition) { //bastard of a function to strip certain values off the front of the definition
    const toTrim = ['1. ', '2. ', '3. ', '4. ', '5. '];
    toTrim.forEach(trimValue => {
        if (fullDefinition.slice(0, 3) == trimValue) fullDefinition = fullDefinition.slice(3);
    });
    return fullDefinition;
}

const checkSentenceFormatting = function (definition) {
    for (var i = 0; i < definition.length - 1; i++) {
        if (definition[i] == "." && definition[i + 1] != " ") {
            definition = definition.slice(0, i+1) + " " + definition.slice(i+1);
        }
    }
    return definition;
}