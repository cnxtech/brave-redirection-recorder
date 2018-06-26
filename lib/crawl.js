"use strict";

const shuffle = require("shuffle-array");
const puppeteer = require("puppeteer");

const urlsLib = require("./urls");
const stateLib = require("./state");

const _frameMapping = new WeakMap();
let _frameId = 0;

const idForFrame = frame => {
    const existingFrameId = _frameMapping.get(frame);
    if (existingFrameId !== undefined) {
        return existingFrameId;
    }
    _frameMapping.set(frame, ++_frameId);
    return _frameId;
};


const frameDesc = frame => {
    const frameId = idForFrame(frame);
    const frameUrl = frame.url();
    return `${new Date()}:${frameId}:${frameUrl}:`;
};


const pageDesc = page => {
    return frameDesc(page.mainFrame());
};


const isVisible = async elm => {
    const boxModel = await elm.boxModel();
    return (boxModel !== null);
};


const diffOriginLinks = async (page, state, _) => {
    const matchingAnchors = [];
    const foundAnchorDomains = new Set();

    for (const frame of page.frames()) {
        const anchors = await frame.$$("a");
        for (const anchor of anchors) {
            if (await isVisible(anchor) === false) {
                continue;
            }

            try {
                const href = await (await anchor.getProperty("href")).jsonValue();
                if (href === undefined || href.length < 10) {
                    continue;
                }

                const hrefDomain = urlsLib.getDomain(href);
                if (hrefDomain === false ||
                        foundAnchorDomains.has(hrefDomain) ||
                        state.isNewDomain(href) === false) {
                    continue;
                }

                foundAnchorDomains.add(hrefDomain);
                matchingAnchors.push(anchor);
            } catch (_) {
                continue;
            }
        }
    }

    return matchingAnchors;
};


const navigateToUrl = (page, url, state) => {
    const frameId = idForFrame(page.mainFrame());
    state.pushNavigation({
        requestedUrl: url,
        frameId: frameId,
    });
    state.setFrameIsNavigating(page.mainFrame());
    page.goto(url);
};


const instrumentPage = (page, state, logger, closedCallback) => {
    const width = 1280;
    const height = 2048;

    logger(`${pageDesc(page)}(re)setting page instrumentation`);
    state.cancelTimeoutForPage(page);
    page.setViewport({height, width});
    page.setRequestInterception(true);

    page.on("domcontentloaded", _ => {
        state.haveLoadedFirstPage = true;
        state.addVisitedDomain(page.url());
        logger(`${pageDesc(page)}domcontentloaded`);

        state.setTimeoutForPage(page, () => {
            logger(`${pageDesc(page)}Completing timeout for navigation`);
            manualNavigation(page, state, logger)
                .then(result => {
                    // Occurs when there are no more links to crawl on
                    // the current page
                    if (result === false) {
                        niceClose(page.browser(), logger, state, closedCallback);
                    }
                })
                .catch(_ => {
                    logger(_);
                    niceClose(page.browser(), logger, state, closedCallback);
                });
        }, 3000);
    });

    page.on("request", request => {
        if (request.resourceType() === "image") {
            request.abort();
            return;
        }

        if (request.resourceType() !== "document") {
            request.continue();
            return;
        }

        const frame = request.frame();
        const frameId = idForFrame(frame);

        let isRedirect = true;
        if (state.isFrameNavigating(frame) === true) {
            logger(`${frameDesc(frame)}Caught manual redirection to ${request.url()}`);
            state.setFrameFinishedNavigating(frame);
            isRedirect = false;
        }

        const requestEvent = {
            currentUrl: frame.url(),
            url: request.url(),
            isIFrame: frame !== page.mainFrame(),
            frameId,
            isRedirect,
        };

        state.pushRequest(requestEvent);
        request.continue();
    });
};



const niceClose = (browser, logger, state, cb) => {
    logger("attempting to shut down nicely");
    state.close();
    let mainPage;
    browser.pages()
        .then(pages => {
            mainPage = pages[0];
            return mainPage.waitFor(1000);
        })
        .then(_ => mainPage.close({runBeforeUnload: true}))
        .catch(_ => undefined)
        .then(_ => browser.close())
        .then(_ => {
            cb(state.getCrawlEvents());
        });
};


const manualNavigation = async (page, state, logger) => {
    const links = await diffOriginLinks(page, state, logger);
    if (links.length === 0) {
        logger(pageDesc(page) + "not navigating further, no links on page to manually visit.");
        return false;
    }

    const shuffledAnchors = shuffle(links);
    const currentHost = urlsLib.getHost(page.url());
    for (const anchor of shuffledAnchors) {
        if (await isVisible(anchor) === false) {
            continue;
        }

        let linkHref;
        try {
            const hrefHandle = await anchor.getProperty("href");
            linkHref = await hrefHandle.jsonValue();
        }
        catch (_) {
            logger(`${pageDesc(page)}Unable to find the elm for ${linkHref}, trying again.`);
            continue;
        }

        try {
            logger(`${pageDesc(page)}About to click link for ${linkHref}`);

            await Promise.all([
                anchor.click({delay: 500}),
                page.waitForFunction(
                    (aHost) => aHost !== window.document.location.host,
                    {timeout: 5000},
                    currentHost
                ),
            ]);

            logger(`${pageDesc(page)}Navigating worked`);

            const frameId = idForFrame(page.mainFrame());
            const navigationEvent = {
                requestedUrl: linkHref,
                frameId,
            };

            logger(navigationEvent);
            state.pushNavigation(navigationEvent);
            state.setFrameIsNavigating(page.mainFrame());
            return true;
        } catch (_) {
            logger(`${pageDesc(page)}Clicking ${linkHref} did not navigate page.`);
        }
    }

    logger(`${pageDesc(page)}Could not find any valid anchors.`);
    return false;
};


const crawl = async (crawlArgs, cb) => {
    const DEBUG = crawlArgs.debug ? console.dir : _ => {};

    const state = stateLib.createState();
    const puppeteerOptions = {};

    if (crawlArgs.chromePath) {
        puppeteerOptions.executablePath = crawlArgs.chromePath;
    }

    if (crawlArgs.debug === true) {
        puppeteerOptions.headless = false;
    }

    const browser = await puppeteer.launch(puppeteerOptions);
    const mainPage = (await browser.pages())[0];

    browser.on("targetcreated", target => {
        if (state.haveLoadedFirstPage === false) {
            return;
        }

        DEBUG("New tab opened");
        target.page()
            .then(newPage => {
                if (newPage === null) {
                    return;
                }

                const newViewport = newPage.viewport();
                const mainViewport = mainPage.viewport();
                const isNewFullSizeTab = (
                    (
                        newViewport.width === mainViewport.width &&
                        newViewport.height === mainViewport.height
                    ) ||
                    (
                        newViewport.width === 800 &&
                        newViewport.height === 600
                    )
                );

                if (isNewFullSizeTab === false) {
                    DEBUG(`${pageDesc(newPage)}Closing because not a full page tab`);
                    DEBUG(`${pageDesc(newPage)}main window: ${mainViewport.width}x${mainViewport.height}`);
                    DEBUG(`${pageDesc(newPage)}new window: ${newViewport.width}x${newViewport.height}`);
                    newPage.close();
                    return;
                }

                mainPage.goto(newPage.url());
                newPage.close();
            });
    });

    state.setGlobalTimeout(_ => {
        DEBUG("Global crawling time limit hit.");
        niceClose(browser, DEBUG, state, cb);
    }, crawlArgs.seconds);

    instrumentPage(mainPage, state, DEBUG, cb);
    navigateToUrl(mainPage, crawlArgs.url, state, DEBUG);
};


module.exports.crawl = crawl;
