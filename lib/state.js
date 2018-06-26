/**
 * @file
 * Library for managing state during a crawl.
*/
"use strict";

const urlsLib = require("./urls");

const createState = _ => {
    const state = Object.create(null);

    // Contains navigation events in the following structure
    // {
    //     type: "request",
    //     url: <string>,
    //     frameId: <int>,
    //     isIFrame: <bool>,
    //     time: <int>,
    //     isRedirect: <bool>
    // }
    // or
    // {
    //     type: "navigation",
    //     requestedUrl: <string>,
    //     frameId: <int>,
    //     time: <int>
    // }
    const crawlEvents = [];
    const visitedDomains = new Set([
        "twitter",
        "facebook",
        "instagram",
        "google",
    ]);
    const pageNavigationTimerIdMapping = new WeakMap();
    const pageTimeouts = new Set();
    const manuallyNavigatingFrames = new WeakSet();
    let globalTimeout;
    let isClosed = false;

    state.haveLoadedFirstPage = false;

    const setGlobalTimeout = (cb, sec) => {
        if (globalTimeout !== undefined) {
            clearTimeout(globalTimeout);
        }
        globalTimeout = setTimeout(_ => {
            if (isClosed === false) {
                cb();
            }
        }, sec * 1000);
    };
    state.setGlobalTimeout = setGlobalTimeout;

    const cancelTimeoutForPage = page => {
        const timerId = pageNavigationTimerIdMapping.get(page);
        if (timerId === undefined) {
            return false;
        }

        clearTimeout(timerId);
        pageNavigationTimerIdMapping.delete(page);
        pageTimeouts.delete(timerId);
        return true;
    };
    state.cancelTimeoutForPage = cancelTimeoutForPage;

    const setTimeoutForPage = (page, cb, secs) => {
        cancelTimeoutForPage(page);
        const timerId = setTimeout(_ => {
            if (isClosed === false) {
                cb();
            }
        }, secs);
        pageNavigationTimerIdMapping.set(page, timerId);
        pageTimeouts.add(timerId);
    };
    state.setTimeoutForPage = setTimeoutForPage;

    const setFrameIsNavigating = frame => {
        manuallyNavigatingFrames.add(frame);
    };
    state.setFrameIsNavigating = setFrameIsNavigating;

    const setFrameFinishedNavigating = frame => {
        manuallyNavigatingFrames.delete(frame);
    };
    state.setFrameFinishedNavigating = setFrameFinishedNavigating;

    const isFrameNavigating = frame => {
        return manuallyNavigatingFrames.has(frame);
    };
    state.isFrameNavigating = isFrameNavigating;

    state.addVisitedDomain = url => {
        const domain = urlsLib.getDomain(url);
        if (domain === false) {
            return false;
        }
        visitedDomains.add(domain);
        return true;
    };

    state.isNewDomain = url => {
        const domain = urlsLib.getDomain(url);
        return !visitedDomains.has(domain);
    };

    state.pushRequest = record => {
        if (record.url.indexOf("http") !== 0) {
            return;
        }

        crawlEvents.push({
            type: "request",
            time: Date.now(),
            frameId: record.frameId,
            domain: urlsLib.getDomain(record.url),
            url: record.url,
            isIFrame: record.isIFrame,
            isRedirect: record.isRedirect,
        });
    };

    state.pushNavigation = record => {
        const numRecords = crawlEvents.length;
        const newRecord = {
            type: "navigation",
            time: Date.now(),
            domain: urlsLib.getDomain(record.requestedUrl),
            frameId: record.frameId,
            requestedUrl: record.requestedUrl,
        };

        if (numRecords > 0) {
            const topRecord = crawlEvents[numRecords - 1];
            crawlEvents[numRecords - 1] = newRecord;
            crawlEvents.push(topRecord);
            return;
        }

        crawlEvents.push(newRecord);
    };

    state.getCrawlEvents = _ => crawlEvents;

    state.close = _ => {
        isClosed = true;
        try {
            clearTimeout(globalTimeout);
        } catch (_) {
            // console.log(_);
            // pass
        }

        for (const timerId of Array.from(pageTimeouts)) {
            try {
                clearTimeout(timerId);
            } catch (_) {
                // console.log(_);
                // pass
            }
        }
    };

    return state;
};

module.exports.createState = createState;
