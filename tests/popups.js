"use strict";

const assert = require("assert");

const testServer = require("./lib/server");
const crawler = require("../lib/crawl");

describe("popups", function () {
    describe("small", function () {
        this.timeout(10000);

        it("don't record closed popups", done => {
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/",
                    seconds: 30,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 1);
                    const [first] = results;
                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, "http://" + handle.host + "/");

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/": {
                    fixture: "popup-parent.html",
                },
                "/popup": {
                    fixture: "basic.html",
                },
            }, onServer);
        });
    });

    describe("new pages", function () {
        this.timeout(10000);

        it("full page popup", function (done) {
            crawler.setIsTesting(true);
            const onServer = handle => {
                const crawlArgs = {
                    url: "http://" + handle.host + "/",
                    seconds: 15,
                };

                crawler.crawl(crawlArgs, results => {
                    assert.equal(results.length, 2);
                    const [first, second] = results;

                    assert.equal(first.type, "navigation");
                    assert.equal(first.requestedUrl, "http://" + handle.host + "/");
                    assert.equal(second.type, "navigation");
                    assert.equal(second.requestedUrl, "http://" + handle.host + "/link");

                    assert.equal(first.frameId, second.frameId);

                    handle.close();
                    done();
                });
            };

            testServer.create({
                "/": {
                    code: 200,
                    fixture: "new-tab-link.html",
                },
                "/link": {
                    code: 200,
                    fixture: "basic.html",
                },
            }, onServer);
        });
    });
});
