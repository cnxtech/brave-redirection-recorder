"use strict";

const shuffle = require("shuffle-array");
const puppeteer = require("puppeteer");

const urlsLib = require("./urls");
const stateLib = require("./state");

// If this is true, then we follow local links too.
let isTesting = false;
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

const fileExtensionsToIgnore = new Set([
    "jpg", "jpeg", "png", "pdf", "gif", "zip", "gz", "tar", "bz", "doc",
    "docx", "rtf", "txt", "avi", "mov", "mp4", "xls", "xlsx", "dmg", "exe",
    "wav", "mp3", "aiff",
]);
const diffOriginLinks = async (page, state, logger) => {
    const matchingAnchors = [];
    const foundAnchorDomains = new Set();
    const foundHrefs = [];

    for (const frame of page.frames()) {
        const anchors = await frame.$$("a");
        for (const anchor of anchors) {
            if (await isVisible(anchor) === false) {
                continue;
            }

            let href;
            try {
                href = await (await anchor.getProperty("href")).jsonValue();
            } catch (_) {
                continue;
            }

            if (isTesting === false) {
                if (href === undefined || href.length < 10) {
                    continue;
                }

                if (urlsLib.isHttpUrl(href) === false) {
                    continue;
                }

                const possibleFileExt = urlsLib.guessFileExtension(href);
                if (possibleFileExt !== undefined &&
                        fileExtensionsToIgnore.has(possibleFileExt) === true) {
                    continue;
                }

                const hrefDomain = urlsLib.getDomain(href);
                if (hrefDomain === false ||
                        foundAnchorDomains.has(hrefDomain) ||
                        state.isNewDomain(href) === false) {
                    continue;
                }

                foundAnchorDomains.add(hrefDomain);
            }

            matchingAnchors.push(anchor);
            foundHrefs.push(href);
        }
    }

    logger(`${pageDesc(page)}found links: ${JSON.stringify(foundHrefs)}`);
    return matchingAnchors;
};


const navigateToUrl = (page, url, state) => {
    const frameId = idForFrame(page.mainFrame());
    state.pushNavigation({
        url: url,
        frameId: frameId,
    });
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
        const frame = request.frame();
        if (!frame) {
            request.continue();
            return;
        }

        if (urlsLib.isHttpUrl(request.url()) === false) {
            logger(`${frameDesc(frame)}Canceling non-HTTP request to ${request.url()}`);
            request.abort();
            return;
        }

        // We can speed things up by just not downloading
        // things that affect the presentation of the page
        // in a way we don't care about.
        const resourceTypesToIgnore = new Set([
            "font",
        ]);
        if (resourceTypesToIgnore.has(request.resourceType())) {
            request.abort();
            return;
        }

        if (request.resourceType() !== "document") {
            request.continue();
            return;
        }

        const frameId = idForFrame(frame);
        state.pushRequest(request, frameId);
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
    await page.evaluate(_ => {
        const anchors = Array.from(window.document.querySelectorAll("a[target]"));
        anchors.forEach(elm => {
            elm.target = "_self";
        });
    });

    const links = await diffOriginLinks(page, state, logger);
    if (links.length === 0) {
        logger(pageDesc(page) + "not navigating further, no links on page to manually visit.");
        return false;
    }

    const shuffledAnchors = shuffle(links);
    const currentHost = urlsLib.getHost(page.url());

    for (const anchor of shuffledAnchors) {
        let linkHref;
        let linkFrame;
        let linkContext = await anchor.executionContext();
        try {
            linkFrame = linkContext && linkContext.frame();
            const hrefHandle = await anchor.getProperty("href");
            linkHref = await hrefHandle.jsonValue();
        }
        catch (_) {
            logger(`${pageDesc(page)}Unable to find the elm for ${linkHref}, trying again.`);
            continue;
        }

        try {
            logger(`${pageDesc(page)}About to click link for ${linkHref}`);
            const frameId = idForFrame(page.mainFrame());
            const navigationEvent = {
                url: linkHref,
                frameId,
            };
            state.registerNavigationAttempt(navigationEvent);
            await Promise.all([
                linkFrame.evaluate(
                    inFrameAnchor => inFrameAnchor.click(),
                    anchor
                ),
                page.waitForFunction(
                    (initialHost, initialUrl, isInTestMode) => {
                        if (isInTestMode === true) {
                            return initialUrl !== String(window.document.location);
                        } else {
                            return initialHost !== window.document.location.host;
                        }
                    },
                    {timeout: 6000},
                    currentHost,
                    page.url(),
                    isTesting
                ),
            ]);

            logger(`${pageDesc(page)}Navigating worked`);
            state.commitNavigationAttempt();
            return true;
        } catch (_) {
            logger(_);
            logger(`${pageDesc(page)}Clicking ${linkHref} did not navigate page.`);
            state.rollbackNavigationAttempt();
        }
    }

    logger(`${pageDesc(page)}Could not find any valid anchors.`);
    return false;
};


const crawl = async (crawlArgs, cb) => {
    const logger = crawlArgs.debug ? console.dir : _ => {};

    const state = stateLib.createState();
    const puppeteerOptions = {
        args: [
            // error when launch(); No usable sandbox! Update your kernel
            "--no-sandbox",
            // error when launch(); Failed to load libosmesa.so
            "--disable-gpu",
            // freeze when newPage()
            "--single-process",
        ],
    };

    if (crawlArgs.chromePath) {
        puppeteerOptions.executablePath = crawlArgs.chromePath;
    }

    if (crawlArgs.debug === true) {
        puppeteerOptions.headless = false;
    }

    const browser = await puppeteer.launch(puppeteerOptions);
    const mainPage = (await browser.pages())[0];

    browser.on("targetcreated", async target => {
        logger("New tab opened");
        const newPage = await target.page();
        if (state.haveLoadedFirstPage === false) {
            return;
        }

        if (newPage === null) {
            return;
        }
        logger(` - New tab opened for ${newPage.url()}`);

        const newViewport = newPage.viewport();
        const mainViewport = mainPage.viewport();
        const isNewFullSizeTab = (
            (
                newViewport.width === mainViewport.width &&
                newViewport.height === mainViewport.height
            ) ||
            (
                newViewport.width >= 800 &&
                newViewport.height >= 600
            )
        );

        if (isNewFullSizeTab === false) {
            logger(` - ${pageDesc(newPage)}Closing because not a full page tab`);
            logger(` - ${pageDesc(newPage)}main window: ${mainViewport.width}x${mainViewport.height}`);
            logger(` - ${pageDesc(newPage)}new window: ${newViewport.width}x${newViewport.height}`);
            await newPage.close();
            return;
        }

        await mainPage.goto(newPage.url());
        await newPage.close();
    });

    state.setGlobalTimeout(_ => {
        logger("Global crawling time limit hit.");
        niceClose(browser, logger, state, cb);
    }, crawlArgs.seconds);

    state.setMainFrameId(idForFrame(mainPage.mainFrame()));
    instrumentPage(mainPage, state, logger, cb);
    navigateToUrl(mainPage, crawlArgs.url, state, logger);
};


module.exports.crawl = crawl;
module.exports.setIsTesting = bool => {
    isTesting = !!bool;
};
