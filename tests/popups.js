"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("popups", function () {
    describe("small", function () {
        this.timeout(10000);
        let serverHandle;

        before(function (done) {
            serverHandle = testServer.create({
                "/": {
                    code: 200,
                    fixture: "./tests/fixtures/popup-parent.html",
                },
                "/popup": {
                    code: 200,
                    fixture: "./tests/fixtures/basic.html",
                },
            }, done);
        });

        after(function () {
            serverHandle.close();
        });

        it("don't record closed popups", function (done) {
            const crawlArgs = {
                url: "http://" + serverHandle.host + "/",
                seconds: 30,
            };

            crawler.crawl(crawlArgs, results => {
                assert.equal(results.length, 2);
                assert.equal(results[0].type, "navigation");
                assert.equal(results[1].type, "request");
                const firstFrameId = results[0].frameId;
                const secondFrameId = results[0].frameId;
                assert.equal(secondFrameId, firstFrameId);
                done();
            });
        });
    });

    describe("new pages", function () {
        this.timeout(10000);
        let serverHandle;

        before(function (done) {
            serverHandle = testServer.create({
                "/": {
                    code: 200,
                    fixture: "./tests/fixtures/new-tab-link.html",
                },
                "/link": {
                    code: 200,
                    fixture: "./tests/fixtures/basic.html",
                },
            }, done);
        });

        after(function () {
            serverHandle.close();
        });

        it("Replacing main page", function (done) {
            const crawlArgs = {
                url: "http://" + serverHandle.host + "/",
                seconds: 6,
            };

            crawler.crawl(crawlArgs, results => {
                assert.equal(results.length, 4);

                const firstRequest = results[0];
                assert.equal(firstRequest.type, "navigation");
                const secondRequest = results[1];
                assert.equal(secondRequest.type, "request");
                assert.equal(firstRequest.requestedUrl, secondRequest.url);

                const thirdRequest = results[2];
                assert.equal(thirdRequest.type, "navigation");
                const fourthRequest = results[3];
                assert.equal(fourthRequest.type, "request");
                assert.equal(thirdRequest.requestedUrl, fourthRequest.url);

                const firstFrameId = results[0].frameId;
                results.forEach(record => {
                    assert.equal(record.frameId, firstFrameId);
                });

                done();
            });
        });
    });
});
