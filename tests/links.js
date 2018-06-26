"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("links", function () {
    describe("in iframes", function () {
        this.timeout(10000);
        let serverHandle;

        before(function (done) {
            serverHandle = testServer.create({
                "/": {
                    code: 200,
                    fixture: "./tests/fixtures/redirecting-iframe-parent.html",
                },
                "/iframe": {
                    code: 200,
                    fixture: "./tests/fixtures/redirecting-iframe-child.html",
                },
            }, done);
        });

        after(function () {
            serverHandle.close();
        });

        it("should automatically click links in iframes", function (done) {
            const testHost = "http://" + serverHandle.host;
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
                done();
            });
        });
    });
});
