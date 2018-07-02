"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("links", function () {
    describe("rewriting urls", function () {
        this.timeout(10000);

        it("navigation records should record what URL was actually fetched", done => {
            const onServer = handle => {
                const rootUrl = "http://" + handle.host + "/";
                const crawlArgs = {
                    url: rootUrl,
                    seconds: 15,
                };

                crawler.setIsTesting(true);
                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 2);
                    const [first, second] = results;

                    assert.equal(first.type, "navigation");
                    assert.equal(first.url, rootUrl);

                    assert.equal(second.type, "navigation");
                    assert.equal(second.expectedUrl, rootUrl + "fake-link");
                    assert.equal(second.url, rootUrl + "true-link");
                    assert.equal(second.frameId, first.frameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/": {
                    fixture: "link-with-fake-url.html",
                },
                "/true-link": {
                    fixture: "basic.html",
                },
            }, onServer);
        });
    });

    describe("in iframes", function () {
        this.timeout(10000);

        it("link in frame that does not redirect parent", done => {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/",
                    seconds: 15,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 2);
                    const [first, second] = results;

                    assert.equal(first.type, "navigation");
                    assert.equal(first.url, "http://" + handle.host + "/");
                    const firstFrameId = first.frameId;

                    // Request entry for the iframe request
                    assert.equal(second.type, "request");
                    const childFrameId = second.frameId;
                    assert.notEqual(childFrameId, firstFrameId);
                    assert.equal(second.url, "http://" + handle.host + "/iframe");

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/": {
                    fixture: "iframe.html",
                },
                "/iframe": {
                    fixture: "simple-link.html",
                },
            }, onServer);
        });

        it("link in frame that redirects parent", function (done) {
            const onServer = handle => {
                const testHost = "http://" + handle.host;
                const crawlArgs = {
                    url: testHost + "/",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 3);
                    const [first, second, third] = results;

                    const firstFrameId = first.frameId;
                    assert.equal(first.type, "navigation");
                    assert.equal(first.url, testHost + "/");

                    assert.equal(second.type, "request");
                    assert.equal(second.url, testHost + "/iframe");
                    assert.notEqual(second.frameId, firstFrameId);

                    assert.equal(third.type, "navigation");
                    assert.equal(third.url, "https://doesnotexist.co.uk/");
                    assert.equal(third.frameId, firstFrameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/": {
                    fixture: "redirecting-iframe-parent.html",
                },
                "/iframe": {
                    fixture: "redirecting-iframe-child.html",
                },
            }, onServer);
        });
    });
});
