"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("links", function () {
    describe("in iframes", function () {
        this.timeout(10000);

        it("link in frame that does not redirect parent", done => {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/",
                    seconds: 15,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 3);
                    const [first, second, third] = results;

                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, "http://" + handle.host + "/");
                    const firstFrameId = first.frameId;

                    assert.equal(second.type, "request");
                    assert.equal(second.frameId, firstFrameId);
                    assert.equal(second.url, "http://" + handle.host + "/");

                    // Request entry for the iframe request
                    assert.equal(third.type, "request");
                    const childFrameId = third.frameId;
                    assert.notEqual(childFrameId, firstFrameId);
                    assert.equal(third.url, "http://" + handle.host + "/iframe");

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
                    assert.equal(results.length, 5);
                    const [first, second, third, fourth, fifth] = results;

                    const firstFrameId = first.frameId;
                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, testHost + "/");

                    assert.equal(second.type, "request");
                    assert.equal(second.url, testHost + "/");
                    assert.equal(second.frameId, firstFrameId);

                    assert.equal(third.type, "request");
                    assert.equal(third.url, testHost + "/iframe");
                    assert.notEqual(third.frameId, firstFrameId);

                    assert.equal(fourth.type, "navigation");
                    assert.equal(fourth.requestedUrl, "https://doesnotexist.co.uk/");
                    assert.equal(fourth.frameId, firstFrameId);

                    assert.equal(fifth.type, "request");
                    assert.equal(fifth.url, "https://doesnotexist.co.uk/");
                    assert.equal(fifth.frameId, firstFrameId);

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
