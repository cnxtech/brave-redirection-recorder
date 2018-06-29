"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("iframes", function () {
    describe("no redirects", function () {
        this.timeout(10000);

        it("One child frame", done => {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/main",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 3);
                    assert.equal(results[0].type, "navigation");
                    assert.equal(results[1].type, "request");
                    assert.equal(results[1].frameId, results[0].frameId);

                    assert.equal(results[2].type, "request");
                    assert.notEqual(results[2].frameId, results[1].frameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/main": {
                    fixture: "iframe.html",
                },
                "/iframe": {
                    fixture: "basic.html",
                },
            }, onServer);
        });
    });

    describe("frame redirects", function () {
        this.timeout(10000);

        it("iframe with 301", function (done) {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/main",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 4);
                    assert.equal(results[0].type, "navigation");
                    const firstFrameId = results[0].frameId;

                    // Request entry for the top level request.
                    assert.equal(results[1].type, "request");
                    assert.equal(results[1].frameId, firstFrameId);

                    // Request entry for the first iframe request
                    assert.equal(results[2].type, "request");
                    const childFrameId = results[2].frameId;
                    assert.notEqual(childFrameId, firstFrameId);

                    // Request entry for the child frame redirection
                    assert.equal(results[3].type, "request");
                    assert.equal(results[3].frameId, childFrameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/main": {
                    fixture: "iframe.html",
                },
                "/iframe": {
                    code: 301,
                    response: "/frame-2",
                },
                "/iframe-2": {
                    response: "done",
                },
            }, onServer);
        });
    });
});
