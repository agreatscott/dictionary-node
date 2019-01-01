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
const STATUS_CODES = { OK: 200, SERVER_ERROR: 500 };
const RH_NEW_DEF = {'Content-Type' : 'application/json', 'Definition-Source' : 'new'};
const RH_STORED_DEF = {'Content-Type' : 'application/json', 'Definition-Source' : 'stored'}

/* database queries */
const QUERY_SEARCH_TERM = 'SELECT word, def, insertion_date FROM word_definitions WHERE word = ?';
const QUERY_ADD_DEFINITION = "INSERT INTO word_definitions (word, def) VALUES (?, ?)";

/* database connection */
const con = mysql.createConnection({ // requires dotenv configuration
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const server = http.createServer((req, res) => {

    let term = req.url.slice(1).trim();

    /* lookup term in db */
    con.query(QUERY_SEARCH_TERM, [term], function (error, result, fields) {
        if (error) {
            setServerError(res, 'Error during database lookup');
            res.end();
            return;
        }
        if (term == 'favicon.ico') return res.end();

        if (result.length == 0) { /* term definition not found in db */
            request({
                method: REQUEST_METHOD,
                url: REQUEST_URL + term,
                headers: REQUEST_HEADERS
            }, function (err, response, body) {
                if (err) {
                    setServerError(res, 'Error retrieving definition from web');
                    res.end();
                    return;
                }

                /* scrape term definition from web page */
                let googleDef = scrapeDefinitions(body);

                /* Create JSON and insert new definition into db */
                let googleDefJson = JSON.stringify({
                    definitions: googleDef
                });
                insertDef(con, term, googleDefJson);

                /* return definition */
                res.writeHead(STATUS_CODES.OK, RH_NEW_DEF);
                res.write(googleDefJson);
                res.end();
            });
        }
        else { /* term definition found in db */
            /* return definition */
            res.writeHead(STATUS_CODES.OK, RH_STORED_DEF);
            res.write(result[0].def);
            res.end();
        }
    });


});


server.listen(PORT, HOSTNAME, () => {
    console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});

function setServerError(res, errorMessage) {
    res.statusCode = STATUS_CODES.SERVER_ERROR;
    res.statusMessage = errorMessage;
}

function scrapeDefinitions(body) {
    let $ = cheerio.load(body);
    let a = $("#ires").find('ol').text();
    return parseGoogleDefinition(a);
}

function parseGoogleDefinition(fullGoogleDefinition) {
    let parsedDefArr = [];
    let firstNumericDefIndex = fullGoogleDefinition.indexOf('1.');
    if (firstNumericDefIndex > 5 || firstNumericDefIndex < 0) { //there aren't multiple definitions
        //take everything up to 'synonyms'
        let endPointIndex = fullGoogleDefinition.indexOf('synonym');
        if (endPointIndex != -1) {
            parsedDefArr.push(checkSentenceFormatting(fullGoogleDefinition.slice(0, endPointIndex)));
        }
    }
    else { //the text starts with 1 - there are multiple definitions to look for.
        let definitionNumber = 1;
        while (fullGoogleDefinition.indexOf(definitionNumber.toString() + '.') != -1) {
            let currentDefinitionStartIndex = fullGoogleDefinition.indexOf(definitionNumber.toString() + '.');

            fullGoogleDefinition = fullGoogleDefinition.slice(currentDefinitionStartIndex); //cut off any extra at front of string
            fullGoogleDefinition = trimDefinition(fullGoogleDefinition); //also trim the starter thingy

            let currentDefinitionEndIndex = findCurrentDefinitionEndIndex(fullGoogleDefinition);
            let currentDefinition = fullGoogleDefinition.slice(0, currentDefinitionEndIndex); //extract current definition

            currentDefinition = checkSentenceFormatting(currentDefinition);
            parsedDefArr.push(currentDefinition.trim());

            fullGoogleDefinition = fullGoogleDefinition.slice(currentDefinitionEndIndex); //cut off current definition just added to array.
            definitionNumber++;
        }
    }
    return parsedDefArr;
}

function insertDef(con, word, definition) {
    con.query(QUERY_ADD_DEFINITION, [word, definition], function (err, result) {
        if (err) console.log("definition insert error! " + word);
    });
}


//helper functions
function findCurrentDefinitionEndIndex(fullDefinition) {
    const possibleEnds = ['synonym', '1. ', '2. ', '3. ', '4. ']; //TODO regex? 
    //return the lowest index of all the possible ends, that's greater than -1.
    let currentDefEndIndex = -1;
    possibleEnds.forEach(possibleEnd => {
        let possibleEndIndex = fullDefinition.indexOf(possibleEnd)
        if (currentDefEndIndex == -1 || (possibleEndIndex < currentDefEndIndex && possibleEndIndex > -1)) {
            currentDefEndIndex = possibleEndIndex;
        }
    });
    if (currentDefEndIndex == -1) console.log("couldn't find current definition end via existing possible ends");
    return currentDefEndIndex;
}

function trimDefinition(fullDefinition) { //bastard of a function to strip certain values off the front of the definition
    const toTrim = ['1. ', '2. ', '3. ', '4. ', '5. ', 'informal'];
    toTrim.forEach(trimValue => {
        if (fullDefinition.slice(0, trimValue.length) == trimValue) fullDefinition = fullDefinition.slice(trimValue.length);
    });
    return fullDefinition;
}

function checkSentenceFormatting(definition) {
    for (let i = 0; i < definition.length - 1; i++) {
        if (definition[i] == "." && definition[i + 1] != " ") {
            definition = definition.slice(0, i + 1) + " " + definition.slice(i + 1);
        }
    }
    return definition;
}