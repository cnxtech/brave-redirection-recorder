"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("redirects", function () {
    describe("301s", function () {
        this.timeout(10000);
        let serverHandle;

        before(function (done) {
            serverHandle = testServer.create({
                "/1": {
                    code: 301,
                    response: "/2",
                },
                "/2": {
                    code: 301,
                    response: "/3",
                },
                "/3": {
                    code: 200,
                    response: "end",
                },
            }, done);
        });

        after(function () {
            serverHandle.close();
        });

        it("Chain of 2 redirects", function (done) {
            const crawlArgs = {
                url: "http://" + serverHandle.host + "/1",
                seconds: 30,
            };

            crawler.crawl(crawlArgs, results => {
                assert.equal(results.length, 4);
                assert.equal(results[0].type, "navigation");
                const firstFrameId = results[0].frameId;
                [1,2,3].forEach(index => {
                    assert.equal(results[index].type, "request");
                    assert.equal(results[index].frameId, firstFrameId);
                });
                done();
            });
        });
    });

    describe("Metatag redirects", function () {
        this.timeout(10000);
        let serverHandle;

        before(function (done) {
            serverHandle = testServer.create({
                "/1": {
                    code: 200,
                    fixture: "./tests/fixtures/metatag-redirect.html",
                },
                "/2": {
                    code: 200,
                    response: "done",
                },
            }, done);
        });

        after(function () {
            serverHandle.close();
        });

        it("Single metata redirect", function (done) {
            const testHost = "http://" + serverHandle.host;

            const crawlArgs = {
                url: testHost + "/1",
                seconds: 30,
            };

            crawler.crawl(crawlArgs, results => {
                assert.equal(results.length, 3);

                const firstRequest = results[0];
                assert.equal(firstRequest.type, "navigation");
                assert.equal(firstRequest.requestedUrl, testHost + "/1");

                const secondRequest = results[1];
                assert.equal(secondRequest.type, "request");
                assert.equal(secondRequest.url, testHost + "/1");

                const thirdRequest = results[2];
                assert.equal(thirdRequest.type, "request");
                assert.equal(thirdRequest.url, testHost + "/2");

                const firstFrameId = firstRequest.frameId;
                results.forEach(aResult => {
                    assert.equal(aResult.frameId, firstFrameId);
                });
                done();
            });
        });
    });
});
