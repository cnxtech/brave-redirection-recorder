"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("redirects", function () {
    describe("301s", function () {
        this.timeout(10000);

        it("Chain of 2 redirects", function (done) {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/1",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 3);
                    const [first, second, third] = results;
                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, "http://" + handle.host + "/1");

                    const firstFrameId = first.frameId;
                    assert.equal(second.type, "request");
                    assert.equal(second.frameId, firstFrameId);
                    assert.equal(second.url, "http://" + handle.host + "/2");

                    assert.equal(third.type, "request");
                    assert.equal(third.frameId, firstFrameId);
                    assert.equal(third.url, "http://" + handle.host + "/3");

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/1": {
                    code: 301,
                    response: "/2",
                },
                "/2": {
                    code: 301,
                    response: "/3",
                },
                "/3": {
                    response: "end",
                },
            }, onServer);
        });
    });

    describe("Metatag redirects", function () {
        this.timeout(10000);

        it("Single metata redirect", function (done) {
            const onServer = handle => {
                const testHost = "http://" + handle.host;

                const crawlArgs = {
                    url: testHost + "/1",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 2);
                    const [first, second] = results;

                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, testHost + "/1");

                    assert.equal(second.type, "request");
                    assert.equal(second.url, testHost + "/2");

                    assert.equal(first.frameId, second.frameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/1": {
                    fixture: "metatag-redirect.html",
                },
                "/2": {
                    response: "done",
                },
            }, onServer);
        });
    });
});
