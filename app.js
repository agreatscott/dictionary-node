const dotenv = require('dotenv').config()
const http = require('http');
const assert = require('assert');
const cheerio = require('cheerio');
const request = require('request');
const mysql = require('mysql');

/* server values */
const HOSTNAME = '127.0.0.1';
const PORT = 3000; 

/* request values */
const REQUEST_METHOD = 'GET';
const REQUEST_URL = 'https://www.google.com/search?q=define+';
const REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36"
}

/* response values */
const STATUS_CODES = { OK: 200 };
const RESPONSE_HEADERS = [{
    name: 'Content-Type',
    value: 'application/json'
}];

/* database values */
const QUERY_SEARCH_TERM = 'SELECT term, term_definition, datetime_defined FROM word_definitions WHERE term = \'';
const QUERY_ADD_DEFINITION = 'INSERT INTO word_definitions (term, term_definition) VALUES (\'';

const con = mysql.createConnection({ // requires dotenv configuration
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});


const server = http.createServer((req, res) => {

    let term = req.url.slice(1).trim();
    con.query(generateDefinitionSearchQuery(term), function (error, result, fields) {
        if (error) throw error;
        if (term == 'favicon.ico') return;

        if (result.length == 0) { //if we don't have def, go get it. 
            console.log(term + ' not in database, looking up definition...');
            request({
                method: REQUEST_METHOD,
                url: REQUEST_URL + term,
                headers: REQUEST_HEADERS
            }, function (err, response, body) {
                if (err) {
                    return console.error(err);
                }
                console.log('google definition request for ' + term + ' received!');

                let $ = cheerio.load(body);

                // var a = $(".vmod").text();
                let a = $("#ires").find('ol').text();
                let googledef = parseGoogleDefinition(a);

                //insertDef(con, term, googledef);
                console.log(googledef);
                res.statusCode = STATUS_CODES.OK;
                RESPONSE_HEADERS.forEach(headerObj => {
                    res.setHeader(headerObj.name, headerObj.value);
                });
                let json = JSON.stringify({
                    definitions: googledef
                });
                res.end(json);
                console.log(' *********** END OF REQUEST ***************\n');
            });
        }
        else {
            console.log(term + ' found in database!');
            res.statusCode = STATUS_CODES.OK;
            res.setHeader('Content-Type', 'text/plain');

            res.end(result[0].term_definition);
            console.log(' *********** END OF REQUEST ***************\n');

        }
    });





});


server.listen(PORT, HOSTNAME, () => {
    console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});

function parseGoogleDefinition(fullGoogleDefinition) {
    let parsedDefArr = [];
    let firstNumericDefIndex = fullGoogleDefinition.indexOf('1.');
    if (firstNumericDefIndex > 5 || firstNumericDefIndex < 0) { //there aren't multiple definitions
        console.log('single definition');
        //take everything up to 'synonyms'
        let endPointIndex = fullGoogleDefinition.indexOf('synonym');
        if (endPointIndex != -1) {
            parsedDefArr.push(checkSentenceFormatting(fullGoogleDefinition.slice(0, endPointIndex)));
        }
    }
    else { //the text starts with 1 - there are multiple definitions to look for.
        console.log('multiple definitions');
        let definitionNumber = 1;
        while (fullGoogleDefinition.indexOf(definitionNumber.toString() + '.') != -1) {
            console.log(definitionNumber);
            let currentDefinitionStartIndex = fullGoogleDefinition.indexOf(definitionNumber.toString() + '.');
            console.log("start " + currentDefinitionStartIndex);

            fullGoogleDefinition = fullGoogleDefinition.slice(currentDefinitionStartIndex); //cut off any extra at front of string
            fullGoogleDefinition = trimDefinition(fullGoogleDefinition); //also trim the starter thingy

            let currentDefinitionEndIndex = findCurrentDefinitionEndIndex(fullGoogleDefinition);
            console.log('end ' + currentDefinitionEndIndex);
            let currentDefinition = fullGoogleDefinition.slice(0, currentDefinitionEndIndex); //extract current definition

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
    let completeQuery = QUERY_ADD_DEFINITION.concat(word).concat('\', \'').concat(definition).concat('\')')
    console.log(completeQuery);
    con.query(completeQuery, function (err, result) {
        if (err) throw err;
        console.log("successfully added one new definition for " + word);
    });
}


//helper functions
const findCurrentDefinitionEndIndex = function (fullDefinition) {
    const possibleEnds = ['synonym', '1. ', '2. ', '3. ', '4. ']; //TODO regex? 
    //return the lowest index of all the possible ends, that's greater than -1.
    let currentDefEndIndex = -1;
    possibleEnds.forEach(possibleEnd => {
        console.log('possible end ' + possibleEnd);
        let possibleEndIndex = fullDefinition.indexOf(possibleEnd)
        console.log('possible end index: ' + possibleEndIndex);
        if (currentDefEndIndex == -1 || (possibleEndIndex < currentDefEndIndex && possibleEndIndex > -1)) {
            console.log('new current definition end');
            currentDefEndIndex = possibleEndIndex;
        }
    });
    if (currentDefEndIndex == -1) console.log("couldn't find current definition end via existing possible ends");
    return currentDefEndIndex;
}

const trimDefinition = function (fullDefinition) { //bastard of a function to strip certain values off the front of the definition
    const toTrim = ['1. ', '2. ', '3. ', '4. ', '5. ', 'informal'];
    toTrim.forEach(trimValue => {
        if (fullDefinition.slice(0, trimValue.length) == trimValue) fullDefinition = fullDefinition.slice(trimValue.length);
    });
    return fullDefinition;
}

const checkSentenceFormatting = function (definition) {
    for (let i = 0; i < definition.length - 1; i++) {
        if (definition[i] == "." && definition[i + 1] != " ") {
            definition = definition.slice(0, i+1) + " " + definition.slice(i+1);
        }
    }
    return definition;
}

const generateDefinitionSearchQuery = function (term) {
    return QUERY_SEARCH_TERM.concat(term).concat('\'')
}