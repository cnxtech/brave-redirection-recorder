"use strict";

const http = require("http");
const fs = require("fs");

// End points should be mappings of
//  <http path> -> {
//    code: <int>
//    fixture: <path>,
//    response: ?<string>
//  }
const createTestServer = (endPoints, done) => {
    const server = http.createServer((req, res) => {
        const incomingUrl = req.url;

        const endpointDef = endPoints[incomingUrl];

        if (endpointDef === undefined) {
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.end("Invalid end point");
            return;
        }

        if (endpointDef.code === 301) {
            res.writeHead(301, {
                "Location": "http://" + req.headers["host"] + endpointDef.response,
            });
            res.end();
            return;
        }

        let contentType;
        let responseBody;

        if (endpointDef.fixture) {
            responseBody = fs.readFileSync(endpointDef.fixture, "utf8");
            contentType = "text/html";
        } else {
            responseBody = endpointDef.response;
            contentType = "text/plain";
        }

        res.writeHead(endpointDef.code, {"Content-Type": contentType});
        res.end(responseBody);
    });

    const state = {
        host: undefined,
        close: () => {
            server.close();
        },
    };

    server.listen(0, "0.0.0.0", _ => {
        state.host = "localhost:" + server.address().port;
        done();
    });

    return state;
};

module.exports.create = createTestServer;
