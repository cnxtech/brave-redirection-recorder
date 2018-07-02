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
    // }
    // or
    // {
    //     type: "navigation",
    //     url: <string>,
    //     frameId: <int>,
    //     time: <int>
    // }
    const crawlEvents = [];
    const visitedDomains = new Set([
        "twitter",
        "facebook",
        "instagram",
        "google",
        "apple",

        "anl",
        "here",
    ]);
    const pageNavigationTimerIdMapping = new WeakMap();
    const pageTimeouts = new Set();
    let mainFrameId;
    let globalTimeout;
    let isClosed = false;

    state.setMainFrameId = frameId => {
        mainFrameId = frameId;
    };
    state.getMainFrameId = _ => mainFrameId;

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

    let isInNavigationPhase = false;
    let navigationAttempt;

    // Pushes the request record onto the stack, unless
    // the top item on the log is a navigation record,
    // in which case we just annotate the navigation
    // record with the URL that was actually fetched
    // during the navigation.
    const addRequestRecord = requestRecord => {
        const numEvents = crawlEvents.length;
        if (numEvents === 0) {
            throw "Trying to push a request record w/o any navigation records on the stack.";
        }

        const topEventRecord = crawlEvents[numEvents - 1];
        if (topEventRecord.type === "navigation" &&
                topEventRecord.url === undefined &&
                topEventRecord.frameId === requestRecord.frameId) {
            topEventRecord.url = requestRecord.url;
            return;
        }

        crawlEvents.push(requestRecord);
    };

    const queuedNavigationRequests = [];
    state.pushRequest = (request, frameId) => {
        const url = request.url();

        if (url.indexOf("http") !== 0) {
            return;
        }

        const requestRecord = {
            type: "request",
            time: Date.now(),
            frameId: frameId,
            url: url,
        };

        if (isInNavigationPhase === true) {
            if (frameId === mainFrameId) {
                queuedNavigationRequests.push(requestRecord);
            }
            return;
        }

        addRequestRecord(requestRecord);
    };

    state.registerNavigationAttempt = record => {
        isInNavigationPhase = true;
        navigationAttempt = {
            type: "navigation",
            time: Date.now(),
            frameId: record.frameId,
            expectedUrl: record.url,
        };
    };

    state.pushNavigation = record => {
        crawlEvents.push({
            type: "navigation",
            time: Date.now(),
            frameId: record.frameId,
            expectedUrl: record.url,
        });
    };

    state.commitNavigationAttempt = _ => {
        isInNavigationPhase = false;
        if (navigationAttempt === undefined) {
            return false;
        }
        crawlEvents.push(navigationAttempt);
        if (queuedNavigationRequests.length !== 0) {
            queuedNavigationRequests.forEach(rec => addRequestRecord(rec));
            queuedNavigationRequests.length = 0;
        }
        navigationAttempt = undefined;
        return true;
    };

    state.rollbackNavigationAttempt = _ => {
        navigationAttempt = undefined;
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
